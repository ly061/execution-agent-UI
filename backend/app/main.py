from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import database, generation_agent
from .agent import chat
from .importer import build_preview
from .llm import DEEPSEEK_MODEL, deepseek_enabled
from .models import CaseAssistRequest, CaseAssistResponse, ChatRequest, ChatResponse, ConfirmResponse, GenerationChatRequest, GenerationResponse, GenerationTurnResponse, ImportPreview
from .case_assistant import assist_case
from .generator import extract_document_text, generate_cases


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_db()
    yield


app = FastAPI(title="QA Orbit LangChain Import Agent", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


def _sse(events):
    """Wrap an async iterator of ("event", data) tuples into a text/event-stream response."""

    async def generator():
        try:
            async for event, data in events:
                yield f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        except (ValueError, RuntimeError) as error:
            yield f"event: error\ndata: {json.dumps({'detail': str(error)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream")

@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "framework": "langchain",
        "provider": "deepseek",
        "model": DEEPSEEK_MODEL,
        "model_configured": str(deepseek_enabled()).lower(),
    }


@app.post("/api/config/validate")
async def validate_api_key(x_deepseek_api_key: str | None = Header(default=None)) -> dict[str, object]:
    if not x_deepseek_api_key:
        raise HTTPException(status_code=400, detail="Enter a DeepSeek API key first.")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get("https://api.deepseek.com/models", headers={"Authorization": f"Bearer {x_deepseek_api_key}"})
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="DeepSeek rejected this API key.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail="DeepSeek could not verify this API key right now.")
    return {"valid": True, "provider": "deepseek", "model": DEEPSEEK_MODEL}


@app.post("/api/cases/assist", response_model=CaseAssistResponse)
async def case_assistant(request: CaseAssistRequest, x_deepseek_api_key: str | None = Header(default=None)) -> CaseAssistResponse:
    try:
        return await assist_case(request, x_deepseek_api_key)
    except RuntimeError as error:
        status = 503 if "not configured" in str(error) else 502
        raise HTTPException(status_code=status, detail=str(error)) from error


@app.post("/api/generation/cases", response_model=GenerationResponse)
async def generate_test_cases(file: UploadFile = File(...), x_deepseek_api_key: str | None = Header(default=None)) -> GenerationResponse:
    try:
        return await generate_cases(file.filename or "requirements.txt", await file.read(), x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        status = 503 if "API key" in str(error) else 502
        raise HTTPException(status_code=status, detail=str(error)) from error


@app.post("/api/generation/sessions", response_model=GenerationTurnResponse)
async def create_generation_session(
    text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    x_deepseek_api_key: str | None = Header(default=None),
) -> GenerationTurnResponse:
    """Start an interactive generation session from pasted text or an uploaded document."""
    try:
        if file is not None and file.filename:
            source = file.filename
            requirements = extract_document_text(source, await file.read())
        else:
            source = "Pasted requirements"
            requirements = text or ""
        return await generation_agent.start_session(uuid.uuid4().hex, source, requirements, x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        status = 503 if "API key" in str(error) else 502
        raise HTTPException(status_code=status, detail=str(error)) from error


@app.post("/api/generation/sessions/stream")
async def create_generation_session_stream(
    text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    x_deepseek_api_key: str | None = Header(default=None),
):
    """Same as the session start, but streams the AI thinking process as it works."""
    try:
        if file is not None and file.filename:
            source = file.filename
            requirements = extract_document_text(source, await file.read())
        else:
            source = "Pasted requirements"
            requirements = text or ""
        generation_agent._require_api_key(x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    session_id = uuid.uuid4().hex
    return _sse(generation_agent.stream_create_events(session_id, source, requirements, x_deepseek_api_key))


@app.post("/api/generation/sessions/{session_id}/chat", response_model=GenerationTurnResponse)
async def generation_chat(session_id: str, request: GenerationChatRequest, x_deepseek_api_key: str | None = Header(default=None)) -> GenerationTurnResponse:
    try:
        return await generation_agent.continue_session(session_id, request, x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        status = 503 if "API key" in str(error) else 502
        raise HTTPException(status_code=status, detail=str(error)) from error


@app.post("/api/generation/sessions/{session_id}/chat/stream")
async def generation_chat_stream(session_id: str, request: GenerationChatRequest, x_deepseek_api_key: str | None = Header(default=None)):
    """Same as the chat endpoint, but streams the AI thinking process as it works."""
    row = database.get_generation_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Generation session not found")
    if row["status"] in ("generated", "working") and not request.cases:
        return JSONResponse(generation_agent.session_state(session_id).model_dump(mode="json"))
    try:
        generation_agent._require_api_key(x_deepseek_api_key)
        if not request.cases and not request.message.strip() and not request.answers:
            raise ValueError("Answer the questions or type a message first.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return _sse(generation_agent.stream_turn_events(session_id, request, x_deepseek_api_key))


@app.get("/api/generation/sessions/{session_id}", response_model=GenerationTurnResponse)
def get_generation_session(session_id: str) -> GenerationTurnResponse:
    state = generation_agent.session_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Generation session not found")
    return state


@app.post("/api/imports/preview", response_model=ImportPreview)
async def preview_import(file: UploadFile = File(...)) -> ImportPreview:
    try:
        preview = build_preview(file.filename or "upload.xlsx", await file.read())
        database.save_preview(preview.import_id, preview.filename, preview.model_dump(mode="json"))
        return preview
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Unable to analyze workbook: {error}") from error


@app.post("/api/imports/{import_id}/confirm", response_model=ConfirmResponse)
def confirm(import_id: str) -> ConfirmResponse:
    session = database.get_session(import_id)
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    cases = database.confirm_import(import_id, database.list_cases(import_id))
    return ConfirmResponse(import_id=import_id, imported_count=len(cases), cases=[case.frontend() for case in cases], message=f"Imported {len(cases)} reviewed test case(s).")


@app.get("/api/imports/{import_id}/cases")
def cases(import_id: str) -> dict[str, object]:
    saved = database.list_cases(import_id)
    return {"import_id": import_id, "cases": [case.frontend() for case in saved]}


@app.post("/api/imports/{import_id}/chat", response_model=ChatResponse)
def agent_chat(import_id: str, request: ChatRequest) -> ChatResponse:
    if not database.get_session(import_id):
        raise HTTPException(status_code=404, detail="Import session not found")
    try:
        return chat(import_id, request.message)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
