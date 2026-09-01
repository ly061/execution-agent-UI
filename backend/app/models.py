from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


STANDARD_FIELDS = (
    "case_id",
    "case_type",
    "description",
    "preconditions",
    "test_steps",
    "test_data",
    "expected_result",
    "priority",
)


class ColumnMapping(BaseModel):
    source_column: str
    target_field: str | None = None
    confidence: float = Field(ge=0, le=1)
    reason: str


class ColumnMappingDecision(BaseModel):
    mappings: list[ColumnMapping]


class ImportedCase(BaseModel):
    id: int | None = None
    case_id: str
    case_type: str = "Web"
    description: str = ""
    preconditions: str = ""
    test_steps: str = ""
    test_data: str = ""
    expected_result: str = ""
    priority: str = "P1"
    extra_fields: dict[str, Any] = Field(default_factory=dict)
    source_file: str
    source_sheet: str
    source_row: int
    import_order: int
    field_provenance: dict[str, str] = Field(default_factory=dict)
    mapping_confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)

    def frontend(self) -> dict[str, Any]:
        numeric_id = self.id or int("".join(filter(str.isdigit, self.case_id)) or 0)
        return {
            "id": numeric_id,
            "case_id": self.case_id,
            "title": self.description or "Imported test case",
            "case_type": self.case_type,
            "priority": self.priority,
            "test_set": "Not assigned",
            "automation": "Manual",
            "status": "Draft",
            "updated_at": "Just now",
            "preconditions": self.preconditions,
            "test_steps": self.test_steps,
            "test_data": self.test_data,
            "expected_result": self.expected_result,
            "extra_fields": self.extra_fields,
            "source_sheet": self.source_sheet,
            "source_row": self.source_row,
            "import_order": self.import_order,
        }


class SheetReport(BaseModel):
    name: str
    status: Literal["imported", "no-data", "skipped"]
    reason: str = ""
    header_row: int | None = None
    row_count: int = 0
    mappings: list[ColumnMapping] = Field(default_factory=list)
    table_index: int = 1


class LocatedTable(BaseModel):
    """A table the model located inside a sheet, using 1-based sheet row numbers."""

    header_row: int
    first_data_row: int
    last_data_row: int
    columns: list[str]


class TableLocationDecision(BaseModel):
    tables: list[LocatedTable]


class ImportPreview(BaseModel):
    import_id: str
    filename: str
    cases: list[ImportedCase]
    sheets: list[SheetReport]
    warnings: list[str]
    explanation: list[str]


class ConfirmResponse(BaseModel):
    import_id: str
    imported_count: int
    cases: list[dict[str, Any]]
    message: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class CaseAssistRequest(BaseModel):
    message: str = Field(min_length=1)
    test_case: dict[str, Any]
    available_data_sets: list[str] = Field(default_factory=list)


class CaseAssistResponse(BaseModel):
    message: str
    changes: dict[str, str]


class GeneratedCase(BaseModel):
    case_id: str = Field(default_factory=lambda: f"case_{uuid.uuid4().hex[:12]}")
    title: str
    case_type: Literal["Web", "API", "Mobile"] = "Web"
    priority: Literal["P0", "P1", "P2"] = "P1"
    preconditions: str = ""
    test_steps: str
    expected_result: str
    requirement: str = ""


class AgentSuggestion(BaseModel):
    id: str = Field(default_factory=lambda: f"suggestion_{uuid.uuid4().hex[:12]}")
    category: Literal["ambiguity", "coverage", "quality", "memory", "template"]
    severity: Literal["info", "warning", "critical"] = "info"
    title: str
    detail: str
    evidence: list[str] = Field(default_factory=list)
    related_case_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.7, ge=0, le=1)


class CasePatchOperation(BaseModel):
    op: Literal["add", "update", "remove"]
    case_id: str | None = None
    index: int | None = Field(default=None, ge=1)
    field: Literal[
        "title", "case_type", "priority", "preconditions", "test_steps", "expected_result", "requirement"
    ] | None = None
    value: Any = None
    case: GeneratedCase | None = None


class GenerationResponse(BaseModel):
    filename: str
    summary: str
    cases: list[GeneratedCase]


class GenerationQuestion(BaseModel):
    id: str
    question: str
    options: list[str] = Field(default_factory=list)


class GenerationFlowNode(BaseModel):
    id: str
    label: str
    kind: Literal["start", "step", "decision", "end"] = "step"
    next: list[str] = Field(default_factory=list)


class GenerationFlowchart(BaseModel):
    title: str
    nodes: list[GenerationFlowNode] = Field(default_factory=list)


class GenerationDecision(BaseModel):
    """One model turn in the interactive generation flow."""

    action: Literal["ask", "generate", "reply", "update"]
    message: str = ""
    questions: list[GenerationQuestion] = Field(default_factory=list)
    summary: str = ""
    cases: list[GeneratedCase] = Field(default_factory=list)
    operations: list[CasePatchOperation] = Field(default_factory=list)
    suggestions: list[AgentSuggestion] = Field(default_factory=list)
    flowchart: GenerationFlowchart | None = None


class GenerationTurnResponse(BaseModel):
    session_id: str
    status: Literal["asking", "generated", "working"]
    action: Literal["ask", "generate", "reply", "update"] = "generate"
    message: str
    questions: list[GenerationQuestion] = Field(default_factory=list)
    summary: str = ""
    cases: list[GeneratedCase] = Field(default_factory=list)
    operations: list[CasePatchOperation] = Field(default_factory=list)
    suggestions: list[AgentSuggestion] = Field(default_factory=list)
    flowchart: GenerationFlowchart | None = None
    # Draft-changing turns are proposals. The client must obtain an explicit
    # author decision before replacing the currently reviewed draft.
    requires_approval: bool = False
    approval_title: str = ""
    approval_description: str = ""


class GenerationAnswer(BaseModel):
    question_id: str
    answer: str = Field(max_length=2000)


class GenerationChatRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    answers: list[GenerationAnswer] = Field(default_factory=list)
    cases: list[GeneratedCase] = Field(default_factory=list)


class MemoryCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    memory_type: Literal["semantic", "episodic", "procedural"] = "semantic"
    user_id: str | None = Field(default=None, max_length=120)
    confidence: float = Field(default=0.8, ge=0, le=1)
    source_ids: list[str] = Field(default_factory=list)
    status: Literal["candidate", "active"] = "candidate"


class MemoryRecord(BaseModel):
    id: str
    project_id: str
    user_id: str | None = None
    memory_type: Literal["semantic", "episodic", "procedural"]
    content: str
    confidence: float
    support_count: int
    status: Literal["candidate", "active", "deprecated"]
    source_ids: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


class MemoryStatusRequest(BaseModel):
    status: Literal["candidate", "active", "deprecated"]


class StyleProfile(BaseModel):
    project_id: str
    user_id: str | None = None
    language: str = "mixed"
    title_pattern: str = "descriptive"
    average_title_length: float = 0
    step_style: str = "plain"
    expected_granularity: str = "case_level"
    priority_distribution: dict[str, int] = Field(default_factory=dict)
    preferred_terms: list[str] = Field(default_factory=list)
    sample_count: int = 0
    examples: list[dict[str, Any]] = Field(default_factory=list)
    source_import_id: str = ""


class TemplateProfile(BaseModel):
    id: str
    project_id: str
    name: str
    source_import_id: str
    filename: str
    sheets: list[dict[str, Any]] = Field(default_factory=list)
    standard_fields: list[str] = Field(default_factory=list)
    extra_fields: list[str] = Field(default_factory=list)
    artifact_path: str = Field(default="", exclude=True)
    active: bool = True
    created_at: str = ""


class ProjectLearningResponse(BaseModel):
    project_id: str
    import_id: str
    imported_count: int
    style_profile: StyleProfile
    template_profile: TemplateProfile
    memory_candidates: list[MemoryRecord] = Field(default_factory=list)
    message: str


class ProjectAgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    requirements: str = Field(default="", max_length=45000)
    cases: list[GeneratedCase] = Field(default_factory=list)
    user_id: str | None = Field(default=None, max_length=120)
    thread_id: str | None = Field(default=None, max_length=200)
    generation_session_id: str | None = Field(default=None, max_length=200)


class ProjectAgentResponse(BaseModel):
    message: str
    thread_id: str
    memory_candidates: list[MemoryRecord] = Field(default_factory=list)


class CaseExportRequest(BaseModel):
    cases: list[GeneratedCase] = Field(min_length=1, max_length=200)
    filename: str | None = Field(default=None, max_length=200)


class Change(BaseModel):
    case_id: str
    import_order: int
    field: str
    before: Any = None
    after: Any = None


class ChatResponse(BaseModel):
    message: str
    changes: list[Change] = Field(default_factory=list)
    cases: list[dict[str, Any]] = Field(default_factory=list)
    can_undo: bool = False


class AgentKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    project_id: str | None = Field(default=None, max_length=120)


class AgentKeyCreated(BaseModel):
    id: str
    name: str
    api_key: str
    key_prefix: str
    project_id: str | None = None
    created_at: str


class AgentSessionRequest(BaseModel):
    api_key: str = Field(min_length=16, max_length=512)
    device_id: str = Field(min_length=1, max_length=200)
    device_name: str = Field(min_length=1, max_length=200)
    platform: str = Field(default="unknown", max_length=80)
    agent_version: str = Field(default="0.1.0", max_length=80)
    capabilities: dict[str, Any] = Field(default_factory=dict)


class AgentSessionResponse(BaseModel):
    access_token: str
    expires_in: int
    agent: dict[str, Any]


class RunTarget(BaseModel):
    type: Literal["test_case", "test_set", "test_plan", "batch_test_set", "rerun"]
    id: int | None = None
    ids: list[int] = Field(default_factory=list)
    name: str = Field(min_length=1, max_length=300)


class RunCreateRequest(BaseModel):
    target: RunTarget
    application: str = Field(min_length=1, max_length=200)
    environment: str = Field(min_length=1, max_length=100)
    build: str = Field(default="", max_length=120)
    instructions: str = Field(default="", max_length=10000)
    execution_target: Literal["local_agent", "server_worker", "device_farm"] = "local_agent"
    assigned_agent_id: str | None = Field(default=None, max_length=120)
    capture_screenshots: bool = True
    headless: bool = False
    max_steps: int = Field(default=50, ge=1, le=100)
    allowed_domains: list[str] = Field(default_factory=list)


class AgentClaimRequest(BaseModel):
    lease_seconds: int = Field(default=60, ge=30, le=300)


class RunPlanStatusRequest(BaseModel):
    status: Literal["running", "paused", "completed", "failed", "cancelled", "interrupted"]
    result: str = Field(default="", max_length=100000)
    error: str = Field(default="", max_length=20000)
    logs: list[str] = Field(default_factory=list)
