from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from . import case_agent_v2, database, deep_orchestrator, generation_agent, project_memory
from .agent import chat
from .importer import build_preview
from .llm import DEEPSEEK_MODEL, deepseek_enabled
from .execution import build_run_plan_snapshot
from .models import AgentClaimRequest, AgentKeyCreated, AgentKeyCreateRequest, AgentSessionRequest, AgentSessionResponse, CaseAssistRequest, CaseAssistResponse, CaseExportRequest, ChatRequest, ChatResponse, ConfirmResponse, GenerationChatRequest, GenerationResponse, GenerationTurnResponse, ImportPreview, MemoryCreateRequest, MemoryRecord, MemoryStatusRequest, ProjectAgentRequest, ProjectAgentResponse, ProjectLearningResponse, RunCreateRequest, RunPlanStatusRequest
from .case_assistant import assist_case
from .generator import extract_document_text, generate_cases
from .template_renderer import render_cases


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


# Case Agent v2 — Auto/HITP orchestration, immutable artifacts and project profiles.
@app.get("/api/projects/{project_id}/case-agent/profiles")
def list_case_agent_profiles(project_id: str) -> dict[str, object]:
    # Ensures every project has the required editable Default Profile.
    if not database.list_case_agent_profiles(project_id):
        case_agent_v2.create_profile(project_id, case_agent_v2.ProfileInput(name="Default Profile"))
    return {"profiles": database.list_case_agent_profiles(project_id)}


@app.post("/api/projects/{project_id}/case-agent/profiles", status_code=201)
def create_case_agent_profile(project_id: str, request: case_agent_v2.ProfileInput, copy_from: str | None = None) -> dict[str, object]:
    try:
        return case_agent_v2.create_profile(project_id, request, copy_from=copy_from)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/projects/{project_id}/case-agent/runs", status_code=201)
def start_case_agent_run(project_id: str, request: case_agent_v2.RunInput) -> dict[str, object]:
    try:
        return case_agent_v2.start_run(project_id, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/projects/{project_id}/case-agent/runs/{run_id}/continue")
def continue_case_agent_run(project_id: str, run_id: str, request: case_agent_v2.ContinueInput) -> dict[str, object]:
    run = database.get_case_agent_run(run_id)
    if not run or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Run not found.")
    try:
        return case_agent_v2.continue_run(run_id, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/projects/{project_id}/case-agent/artifacts")
def list_case_agent_artifacts(project_id: str, artifact_type: str | None = None) -> dict[str, object]:
    return {"artifacts": database.list_case_agent_artifacts(project_id, artifact_type)}


@app.get("/api/projects/{project_id}/case-agent/artifacts/{artifact_id}")
def get_case_agent_artifact(project_id: str, artifact_id: str, revision: int | None = None) -> dict[str, object]:
    artifact = database.get_case_agent_artifact(artifact_id, revision)
    if not artifact or artifact["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return artifact


@app.post("/api/projects/{project_id}/case-agent/artifacts/{artifact_id}/mutate")
def mutate_case_agent_artifact(project_id: str, artifact_id: str, request: case_agent_v2.ArtifactMutation) -> dict[str, object]:
    artifact = database.get_case_agent_artifact(artifact_id)
    if not artifact or artifact["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    try:
        return case_agent_v2.mutate_artifact(artifact_id, request)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/projects/{project_id}/case-agent/query")
def query_case_agent(project_id: str, request: case_agent_v2.QueryInput) -> dict[str, object]:
    return case_agent_v2.evidence_query(project_id, request)


def require_agent(authorization: str | None = Header(default=None)) -> dict[str, object]:
    token = (authorization or "").removeprefix("Bearer ").strip()
    agent = database.agent_for_access_token(token) if token else None
    if not agent:
        raise HTTPException(status_code=401, detail="Invalid or expired Local Agent session.")
    return agent


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


@app.post("/api/agent-keys", response_model=AgentKeyCreated, status_code=201)
def create_agent_key(request: AgentKeyCreateRequest) -> AgentKeyCreated:
    """Create a Local Agent enrollment key. The plaintext key is returned once."""
    return AgentKeyCreated.model_validate(database.create_agent_api_key(request.name, request.project_id))


@app.get("/api/agent-keys")
def list_agent_keys(project_id: str | None = None) -> dict[str, object]:
    return {"agent_keys": database.list_agent_api_keys(project_id)}


@app.delete("/api/agent-keys/{key_id}")
def revoke_agent_key(key_id: str) -> dict[str, bool]:
    if not database.revoke_agent_api_key(key_id):
        raise HTTPException(status_code=404, detail="The Local Agent API key was not found.")
    return {"revoked": True}


@app.post("/api/agent/v1/sessions", response_model=AgentSessionResponse)
def create_agent_session(request: AgentSessionRequest) -> AgentSessionResponse:
    session = database.create_agent_session(
        request.api_key,
        device_id=request.device_id,
        device_name=request.device_name,
        platform=request.platform,
        agent_version=request.agent_version,
        capabilities=request.capabilities,
    )
    if not session:
        raise HTTPException(status_code=401, detail="The Local Agent API key is invalid or revoked.")
    return AgentSessionResponse.model_validate(session)


@app.post("/api/agent/v1/heartbeat")
def agent_heartbeat(agent: dict[str, object] = Depends(require_agent)) -> dict[str, object]:
    return database.heartbeat_agent(str(agent["id"]))


@app.post("/api/runs", status_code=201)
def create_run(request: RunCreateRequest) -> dict[str, object]:
    try:
        snapshot = build_run_plan_snapshot(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    plan = database.create_execution_run(request, snapshot)
    return {"run": {"id": plan["run_id"], "status": plan["status"]}, "run_plan": plan}


@app.get("/api/run-plans")
def run_plans() -> dict[str, object]:
    return {"run_plans": database.list_run_plans()}


@app.post("/api/agent/v1/run-plans/claim")
def claim_run_plan(request: AgentClaimRequest, agent: dict[str, object] = Depends(require_agent)) -> dict[str, object]:
    return {"run_plan": database.claim_run_plan(str(agent["id"]), request.lease_seconds)}


@app.post("/api/agent/v1/run-plans/{run_plan_id}/status")
def update_run_plan(
    run_plan_id: str,
    request: RunPlanStatusRequest,
    agent: dict[str, object] = Depends(require_agent),
) -> dict[str, object]:
    plan = database.update_run_plan_status(
        str(agent["id"]), run_plan_id, request.status, request.result, request.error, request.logs
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Run Plan was not found or is assigned to another Agent.")
    return {"run_plan": plan}


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
    project_id: str = Form(default="default"),
    user_id: str | None = Form(default=None),
    x_deepseek_api_key: str | None = Header(default=None),
) -> GenerationTurnResponse:
    """Start an interactive generation session from pasted text or an uploaded document."""
    try:
        if file is not None and file.filename:
            source = file.filename
            requirements = extract_document_text(source, await file.read())
            if text and text.strip():
                requirements = f"{requirements}\n\nAdditional author instructions:\n{text.strip()}"
        else:
            source = "Pasted requirements"
            requirements = text or ""
        return await generation_agent.start_session(
            uuid.uuid4().hex, source, requirements, x_deepseek_api_key, project_id=project_id, user_id=user_id
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        status = 503 if "API key" in str(error) else 502
        raise HTTPException(status_code=status, detail=str(error)) from error


@app.post("/api/generation/sessions/stream")
async def create_generation_session_stream(
    text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    project_id: str = Form(default="default"),
    user_id: str | None = Form(default=None),
    x_deepseek_api_key: str | None = Header(default=None),
):
    """Same as the session start, but streams the AI thinking process as it works."""
    try:
        if file is not None and file.filename:
            source = file.filename
            requirements = extract_document_text(source, await file.read())
            if text and text.strip():
                requirements = f"{requirements}\n\nAdditional author instructions:\n{text.strip()}"
        else:
            source = "Pasted requirements"
            requirements = text or ""
        generation_agent._require_api_key(x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    session_id = uuid.uuid4().hex
    return _sse(
        generation_agent.stream_create_events(
            session_id, source, requirements, x_deepseek_api_key, project_id=project_id, user_id=user_id
        )
    )


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
async def preview_import(
    file: UploadFile = File(...),
    project_id: str = Form(default="default"),
    user_id: str | None = Form(default=None),
) -> ImportPreview:
    try:
        preview = build_preview(file.filename or "upload.xlsx", await file.read())
        database.save_preview(
            preview.import_id,
            preview.filename,
            preview.model_dump(mode="json"),
            project_id=project_id,
            user_id=user_id,
        )
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


@app.post("/api/projects/{project_id}/learning/cases", response_model=ProjectLearningResponse)
async def learn_project_cases(
    project_id: str,
    file: UploadFile = File(...),
    user_id: str | None = Form(default=None),
) -> ProjectLearningResponse:
    """Learn a deterministic template/style profile from approved historical cases."""
    try:
        content = await file.read()
        preview = build_preview(file.filename or "historical-cases.xlsx", content)
        database.save_preview(
            preview.import_id,
            preview.filename,
            preview.model_dump(mode="json"),
            project_id=project_id,
            user_id=user_id,
        )
        return project_memory.learn_from_import(
            preview.import_id, project_id, user_id, raw_template=content
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Unable to learn from workbook: {error}") from error


@app.post("/api/projects/{project_id}/imports/{import_id}/learn", response_model=ProjectLearningResponse)
def learn_confirmed_import(project_id: str, import_id: str, user_id: str | None = None) -> ProjectLearningResponse:
    try:
        return project_memory.learn_from_import(import_id, project_id, user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/projects/{project_id}/profiles")
def project_profiles(project_id: str, user_id: str | None = None) -> dict[str, object]:
    template = database.get_active_template_profile(project_id)
    if template:
        template = {key: value for key, value in template.items() if key != "artifact_path"}
    return {
        "project_id": project_id,
        "style_profile": database.get_style_profile(project_id, user_id),
        "template_profile": template,
    }


@app.post("/api/projects/{project_id}/memories", response_model=MemoryRecord, status_code=201)
def create_project_memory(project_id: str, request: MemoryCreateRequest) -> MemoryRecord:
    try:
        memory = database.save_memory(
            project_id=project_id,
            user_id=request.user_id,
            memory_type=request.memory_type,
            content=request.content,
            confidence=request.confidence,
            status=request.status,
            source_ids=request.source_ids,
        )
        return MemoryRecord.model_validate(memory)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/projects/{project_id}/memories")
def project_memories(
    project_id: str,
    user_id: str | None = None,
    include_candidates: bool = True,
) -> dict[str, object]:
    statuses = ("active", "candidate") if include_candidates else ("active",)
    return {
        "project_id": project_id,
        "memories": database.list_memories(
            project_id, user_id=user_id, statuses=statuses, include_global=False
        ),
    }


@app.patch("/api/projects/{project_id}/memories/{memory_id}", response_model=MemoryRecord)
def set_project_memory_status(project_id: str, memory_id: str, request: MemoryStatusRequest) -> MemoryRecord:
    memory = database.get_memory(memory_id)
    if not memory or memory["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Project memory was not found.")
    updated = database.update_memory_status(memory_id, request.status)
    return MemoryRecord.model_validate(updated)


@app.post("/api/projects/{project_id}/agent/chat", response_model=ProjectAgentResponse)
async def project_agent_chat(
    project_id: str,
    request: ProjectAgentRequest,
    x_deepseek_api_key: str | None = Header(default=None),
) -> ProjectAgentResponse:
    """Run the Deep Agents supervisor with project-scoped, read-mostly QA tools."""
    try:
        return await deep_orchestrator.advise_project(project_id, request, x_deepseek_api_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/projects/{project_id}/export")
def export_project_cases(project_id: str, request: CaseExportRequest) -> Response:
    profile = database.get_active_template_profile(project_id)
    if not profile:
        raise HTTPException(
            status_code=409,
            detail="Upload approved historical cases before exporting with a project template.",
        )
    filename, content = render_cases(profile, request.cases)
    if request.filename:
        requested = request.filename.rsplit(".", 1)[0].strip()
        if requested:
            filename = f"{requested}.xlsx"
    safe_filename = "".join(
        character for character in filename if character.isascii() and (character.isalnum() or character in "-_.")
    )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename or "generated-cases.xlsx"}"'},
    )
