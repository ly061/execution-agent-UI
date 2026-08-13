from __future__ import annotations

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
    status: Literal["imported", "skipped"]
    reason: str = ""
    header_row: int | None = None
    row_count: int = 0
    mappings: list[ColumnMapping] = Field(default_factory=list)


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
