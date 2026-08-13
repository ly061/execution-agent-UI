from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
import httpx
from fastapi.middleware.cors import CORSMiddleware

from . import database
from .agent import chat
from .importer import build_preview
from .llm import DEEPSEEK_MODEL, deepseek_enabled
from .models import ChatRequest, ChatResponse, ConfirmResponse, ImportPreview


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
