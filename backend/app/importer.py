from __future__ import annotations

import csv
import io
import re
import uuid
from pathlib import Path
from typing import Any

from langgraph.graph import END, START, StateGraph
from openpyxl import load_workbook
from typing_extensions import TypedDict

from .models import ColumnMapping, ColumnMappingDecision, ImportPreview, ImportedCase, SheetReport, STANDARD_FIELDS
from .llm import create_deepseek_model, deepseek_enabled


ALIASES = {
    "case_id": {"case id", "caseid", "test case id", "testcase id", "用例id", "用例编号", "编号"},
    "case_type": {"case type", "type", "platform", "channel", "用例类型", "类型", "端"},
    "description": {"description", "title", "case name", "test case", "scenario", "scenario name", "summary", "用例描述", "描述", "用例名称", "场景"},
    "preconditions": {"pre conditions", "preconditions", "pre condition", "prerequisite", "prerequisites", "前置条件", "执行前置条件"},
    "test_steps": {"test steps", "steps", "step", "actions", "procedure", "测试步骤", "操作步骤", "步骤"},
    "test_data": {"test data", "data", "data set", "dataset", "data point", "测试数据", "数据集", "测试资料"},
    "expected_result": {"expected result", "expected results", "expected", "outcome", "assertion", "预期结果", "期望结果"},
    "priority": {"priority", "severity", "importance", "优先级", "重要级别"},
}


def normalize(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-")
    return re.sub(r"[\s\-–—/:()]+", " ", text).strip()


def rule_mapping(headers: list[str]) -> list[ColumnMapping]:
    mappings: list[ColumnMapping] = []
    used: set[str] = set()
    for header in headers:
        normalized = normalize(header)
        exact = next((field for field, aliases in ALIASES.items() if normalized in aliases), None)
        if exact and exact not in used:
            mappings.append(ColumnMapping(source_column=header, target_field=exact, confidence=1, reason="Known field alias"))
            used.add(exact)
            continue
        partial = next(
            (
                field
                for field, aliases in ALIASES.items()
                if field not in used and any(len(alias) >= 4 and (alias in normalized or normalized in alias) for alias in aliases)
            ),
            None,
        )
        if partial:
            mappings.append(ColumnMapping(source_column=header, target_field=partial, confidence=.82, reason="Similar field name"))
            used.add(partial)
        else:
            mappings.append(ColumnMapping(source_column=header, target_field=None, confidence=1, reason="Preserved as an extra field"))
    return mappings


def semantic_mapping(headers: list[str], samples: list[dict[str, Any]], current: list[ColumnMapping]) -> list[ColumnMapping]:
    if not deepseek_enabled():
        return current
    ambiguous = [item.source_column for item in current if item.target_field is None]
    if not ambiguous:
        return current
    try:
        from langchain.agents import create_agent
        agent = create_agent(
            model=create_deepseek_model(),
            tools=[],
            response_format=ColumnMappingDecision,
            system_prompt=(
                "Map spreadsheet columns to the QA Orbit schema. Allowed targets: "
                + ", ".join(STANDARD_FIELDS)
                + ". Use null for unrelated fields. Never invent a source column or map two columns to one target."
            ),
        )
        result = agent.invoke({"messages": [{"role": "user", "content": f"Headers: {headers}\nSample rows: {samples[:3]}"}]})
        decision = result["structured_response"]
        proposed = {item.source_column: item for item in decision.mappings if item.source_column in ambiguous}
        used = {item.target_field for item in current if item.target_field}
        merged: list[ColumnMapping] = []
        for item in current:
            candidate = proposed.get(item.source_column)
            if candidate and candidate.target_field in STANDARD_FIELDS and candidate.target_field not in used:
                candidate.confidence = min(candidate.confidence, .79)
                candidate.reason = "LangChain semantic mapping"
                merged.append(candidate)
                used.add(candidate.target_field)
            else:
                merged.append(item)
        return merged
    except Exception:
        return current


def read_workbook(filename: str, content: bytes) -> list[tuple[str, list[list[Any]]]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        text = content.decode("utf-8-sig", errors="replace")
        return [(Path(filename).stem, list(csv.reader(io.StringIO(text))))]
    if suffix == ".xls":
        import xlrd

        book = xlrd.open_workbook(file_contents=content)
        return [(sheet.name, [sheet.row_values(index) for index in range(sheet.nrows)]) for sheet in book.sheets()]
    if suffix not in {".xlsx", ".xlsm"}:
        raise ValueError("Supported files are .xlsx, .xls, .xlsm and .csv")
    book = load_workbook(io.BytesIO(content), read_only=False, data_only=True)
    sheets: list[tuple[str, list[list[Any]]]] = []
    for sheet in book.worksheets:
        rows = [[cell.value for cell in row] for row in sheet.iter_rows()]
        for merged in list(sheet.merged_cells.ranges):
            value = rows[merged.min_row - 1][merged.min_col - 1]
            for row_index in range(merged.min_row - 1, merged.max_row):
                for column_index in range(merged.min_col - 1, merged.max_col):
                    rows[row_index][column_index] = value
        sheets.append((sheet.title, rows))
    return sheets


def header_score(row: list[Any]) -> float:
    values = [normalize(value) for value in row if str(value or "").strip()]
    if len(values) < 2:
        return 0
    known = sum(any(value in aliases or any(alias in value for alias in aliases if len(alias) >= 4) for aliases in ALIASES.values()) for value in values)
    return known * 4 + min(len(values), 8) * .25


def analyze_sheet(name: str, rows: list[list[Any]]) -> tuple[int | None, list[str], list[dict[str, Any]]]:
    candidates = [(index, header_score(row)) for index, row in enumerate(rows[:25])]
    if not candidates or max(score for _, score in candidates) < 1:
        return None, [], []
    header_index = max(candidates, key=lambda item: item[1])[0]
    raw_headers = rows[header_index]
    headers: list[str] = []
    seen: dict[str, int] = {}
    for index, value in enumerate(raw_headers):
        header = str(value or f"Column {index + 1}").strip()
        seen[header] = seen.get(header, 0) + 1
        headers.append(f"{header} ({seen[header]})" if seen[header] > 1 else header)
    data_rows = []
    for source_index, row in enumerate(rows[header_index + 1 :], start=header_index + 2):
        values = list(row) + [None] * max(0, len(headers) - len(row))
        record = {headers[index]: values[index] for index in range(len(headers)) if values[index] not in (None, "")}
        if record:
            record["__source_row__"] = source_index
            data_rows.append(record)
    return header_index + 1, headers, data_rows


def normalize_type(value: Any) -> str:
    text = str(value or "Web").strip().lower()
    if "api" in text or "接口" in text:
        return "API"
    if "mobile" in text or "app" in text or "移动" in text:
        return "Mobile"
    return "Web"


def normalize_priority(value: Any) -> str:
    text = str(value or "P1").strip().upper()
    aliases = {"HIGH": "P0", "CRITICAL": "P0", "最高": "P0", "MEDIUM": "P1", "中": "P1", "LOW": "P2", "低": "P2"}
    return text if text in {"P0", "P1", "P2"} else aliases.get(text, "P1")


class ImportState(TypedDict, total=False):
    filename: str
    content: bytes
    sheets: list[tuple[str, list[list[Any]]]]
    preview: ImportPreview


def parse_node(state: ImportState) -> dict[str, Any]:
    return {"sheets": read_workbook(state["filename"], state["content"])}


def map_node(state: ImportState) -> dict[str, Any]:
    import_id = str(uuid.uuid4())
    all_cases: list[ImportedCase] = []
    reports: list[SheetReport] = []
    warnings: list[str] = []
    next_generated = 1
    for sheet_name, rows in state["sheets"]:
        header_row, headers, data_rows = analyze_sheet(sheet_name, rows)
        if header_row is None or not data_rows:
            reports.append(SheetReport(name=sheet_name, status="skipped", reason="No tabular test case data detected"))
            continue
        mappings = semantic_mapping(headers, data_rows, rule_mapping(headers))
        target_by_source = {item.source_column: item.target_field for item in mappings}
        confidence_by_source = {item.source_column: item.confidence for item in mappings}
        sheet_count = 0
        for record in data_rows:
            standard: dict[str, Any] = {}
            extras: dict[str, Any] = {}
            provenance: dict[str, str] = {}
            confidences: list[float] = []
            for source, value in record.items():
                if source == "__source_row__":
                    continue
                target = target_by_source.get(source)
                if target:
                    standard[target] = value
                    provenance[target] = f"{sheet_name}!{source} row {record['__source_row__']}"
                    confidences.append(confidence_by_source[source])
                else:
                    extras[source] = value
            if not any(str(standard.get(field, "")).strip() for field in ("description", "test_steps", "expected_result")):
                continue
            raw_id = str(standard.get("case_id") or "").strip()
            case_id = raw_id or f"IMP-{next_generated:04d}"
            case_warnings = []
            if not raw_id:
                case_warnings.append("Case ID was generated")
                next_generated += 1
            if not standard.get("description"):
                case_warnings.append("Description is missing")
            imported = ImportedCase(
                case_id=case_id,
                case_type=normalize_type(standard.get("case_type")),
                description=str(standard.get("description") or "").strip(),
                preconditions=str(standard.get("preconditions") or "").strip(),
                test_steps=str(standard.get("test_steps") or "").strip(),
                test_data=str(standard.get("test_data") or "").strip(),
                expected_result=str(standard.get("expected_result") or "").strip(),
                priority=normalize_priority(standard.get("priority")),
                extra_fields=extras,
                source_file=state["filename"],
                source_sheet=sheet_name,
                source_row=record["__source_row__"],
                import_order=len(all_cases) + 1,
                field_provenance=provenance,
                mapping_confidence=sum(confidences) / len(confidences) if confidences else .5,
                warnings=case_warnings,
            )
            all_cases.append(imported)
            sheet_count += 1
        reports.append(SheetReport(name=sheet_name, status="imported", header_row=header_row, row_count=sheet_count, mappings=mappings))
    if not all_cases:
        warnings.append("No test cases were detected. Check the header row and field names.")
    explanation = [
        f"Read {len(state['sheets'])} sheet(s); {sum(report.status == 'imported' for report in reports)} contained test case data.",
        "Matched known aliases first, then used the LangChain semantic mapper for ambiguous columns when a model key was available.",
        "Preserved every unmatched column in extra_fields and recorded the source sheet and row for each case.",
    ]
    return {"preview": ImportPreview(import_id=import_id, filename=state["filename"], cases=all_cases, sheets=reports, warnings=warnings, explanation=explanation)}


workflow = StateGraph(ImportState)
workflow.add_node("read_workbook", parse_node)
workflow.add_node("map_and_validate", map_node)
workflow.add_edge(START, "read_workbook")
workflow.add_edge("read_workbook", "map_and_validate")
workflow.add_edge("map_and_validate", END)
IMPORT_GRAPH = workflow.compile()


def build_preview(filename: str, content: bytes) -> ImportPreview:
    return IMPORT_GRAPH.invoke({"filename": filename, "content": content})["preview"]
