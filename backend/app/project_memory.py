from __future__ import annotations

import json
import hashlib
import re
import statistics
import uuid
from collections import Counter
from typing import Any

from . import database
from .models import (
    AgentSuggestion,
    GeneratedCase,
    ImportedCase,
    MemoryRecord,
    ProjectLearningResponse,
    STANDARD_FIELDS,
    StyleProfile,
    TemplateProfile,
)


_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{2,}|[\u4e00-\u9fff]{2,}")
_NEGATIVE_TERMS = ("invalid", "fail", "error", "reject", "unauthorized", "错误", "失败", "异常", "无效", "拒绝")
_BOUNDARY_TERMS = ("boundary", "limit", "minimum", "maximum", "empty", "边界", "上限", "下限", "为空")


def _tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for match in _WORD_RE.findall(text.lower()):
        tokens.add(match)
        if re.fullmatch(r"[\u4e00-\u9fff]+", match) and len(match) > 2:
            tokens.update(match[index : index + 2] for index in range(len(match) - 1))
    return tokens


def _style_profile(
    project_id: str,
    import_id: str,
    cases: list[ImportedCase],
    user_id: str | None,
) -> StyleProfile:
    titles = [case.description.strip() for case in cases if case.description.strip()]
    all_text = "\n".join(
        value
        for case in cases
        for value in (case.description, case.preconditions, case.test_steps, case.expected_result)
        if value
    )
    chinese_count = len(re.findall(r"[\u4e00-\u9fff]", all_text))
    latin_count = len(re.findall(r"[A-Za-z]", all_text))
    language = "zh-CN" if chinese_count > latin_count else "en" if latin_count > chinese_count else "mixed"
    numbered = sum(
        1
        for case in cases
        if re.search(r"(?m)^\s*(?:\d+[.、)]|[一二三四五六七八九十]+[、.])", case.test_steps)
    )
    line_counts = [len([line for line in case.test_steps.splitlines() if line.strip()]) for case in cases]
    step_style = "numbered_multiline" if numbered >= max(1, len(cases) / 2) else "multiline" if any(count > 1 for count in line_counts) else "plain"
    per_step_expected = sum(
        1
        for case in cases
        if len([line for line in case.expected_result.splitlines() if line.strip()]) == len([line for line in case.test_steps.splitlines() if line.strip()])
        and len([line for line in case.test_steps.splitlines() if line.strip()]) > 1
    )
    title_pattern = "module-action-result" if sum("-" in title or "_" in title for title in titles) >= max(1, len(titles) / 2) else "descriptive"
    words = Counter(token for token in _tokens(all_text) if token not in {"test", "case", "测试", "用例"})
    examples = [
        {
            "case_id": case.case_id,
            "title": case.description,
            "case_type": case.case_type,
            "priority": case.priority,
            "preconditions": case.preconditions,
            "test_steps": case.test_steps,
            "expected_result": case.expected_result,
        }
        for case in sorted(cases, key=lambda item: (-item.mapping_confidence, item.import_order))[:8]
    ]
    return StyleProfile(
        project_id=project_id,
        user_id=user_id,
        language=language,
        title_pattern=title_pattern,
        average_title_length=round(statistics.mean(map(len, titles)), 1) if titles else 0,
        step_style=step_style,
        expected_granularity="per_step" if per_step_expected >= max(1, len(cases) / 2) else "case_level",
        priority_distribution=dict(Counter(case.priority for case in cases)),
        preferred_terms=[word for word, _ in words.most_common(12)],
        sample_count=len(cases),
        examples=examples,
        source_import_id=import_id,
    )


def _template_profile(project_id: str, import_id: str, preview: dict[str, Any]) -> TemplateProfile:
    filename = str(preview.get("filename") or "test-cases.xlsx")
    sheets: list[dict[str, Any]] = []
    for sheet in preview.get("sheets") or []:
        mappings = sheet.get("mappings") or []
        sheets.append(
            {
                "name": sheet.get("name") or "Sheet1",
                "table_index": int(sheet.get("table_index") or 1),
                "header_row": sheet.get("header_row"),
                "columns": [item.get("source_column") for item in mappings if item.get("source_column")],
                "field_mapping": {
                    item.get("source_column"): item.get("target_field")
                    for item in mappings
                    if item.get("source_column")
                },
            }
        )
    cases = [ImportedCase.model_validate(item) for item in preview.get("cases") or []]
    extra_fields = sorted({field for case in cases for field in case.extra_fields})
    return TemplateProfile(
        id=f"template_{uuid.uuid4().hex[:12]}",
        project_id=project_id,
        name=f"{filename} template",
        source_import_id=import_id,
        filename=filename,
        sheets=sheets,
        standard_fields=list(STANDARD_FIELDS),
        extra_fields=extra_fields,
    )


def _save_template_artifact(project_id: str, template_id: str, filename: str, content: bytes) -> str:
    suffix = ".xlsx" if filename.lower().endswith(".xlsx") else ".xls" if filename.lower().endswith(".xls") else ".csv"
    project_key = hashlib.sha256(project_id.encode("utf-8")).hexdigest()[:16]
    directory = database.DATA_DIR / "templates" / project_key
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{template_id}{suffix}"
    path.write_bytes(content)
    return str(path)


def learn_from_import(
    import_id: str,
    project_id: str,
    user_id: str | None = None,
    raw_template: bytes | None = None,
) -> ProjectLearningResponse:
    session = database.get_session(import_id)
    if not session:
        raise ValueError("Import session was not found.")
    cases = database.list_cases(import_id)
    if not cases:
        raise ValueError("The import contains no test cases to learn from.")
    preview = json.loads(session["preview_json"])
    style = _style_profile(project_id, import_id, cases, user_id)
    template = _template_profile(project_id, import_id, preview)
    if raw_template:
        template.artifact_path = _save_template_artifact(
            project_id, template.id, template.filename, raw_template
        )
    database.save_style_profile(project_id, style.model_dump(exclude={"examples"}), style.examples, import_id, user_id)
    template_payload = template.model_dump(mode="json")
    template_payload["artifact_path"] = template.artifact_path
    saved_template = database.save_template_profile(project_id, template_payload)
    candidate = database.save_memory(
        project_id=project_id,
        user_id=user_id,
        memory_type="procedural",
        content=(
            f"Use the learned test-case style: language={style.language}; title_pattern={style.title_pattern}; "
            f"step_style={style.step_style}; expected_granularity={style.expected_granularity}."
        ),
        confidence=min(0.95, 0.55 + min(len(cases), 20) * 0.02),
        status="candidate",
        source_ids=[import_id],
        keywords=["style", "template", style.language, style.step_style],
    )
    return ProjectLearningResponse(
        project_id=project_id,
        import_id=import_id,
        imported_count=len(cases),
        style_profile=style,
        template_profile=TemplateProfile.model_validate(saved_template),
        memory_candidates=[MemoryRecord.model_validate(candidate)],
        message=(
            f"Learned a template and writing profile from {len(cases)} case(s). "
            "The derived procedural memory is a candidate until it is approved."
        ),
    )


def retrieve_context(project_id: str, user_id: str | None, query: str, limit: int = 8) -> dict[str, Any]:
    query_tokens = _tokens(query)
    memories = database.list_memories(project_id, user_id=user_id, statuses=("active",), limit=100)
    ranked: list[tuple[float, dict[str, Any]]] = []
    for memory in memories:
        memory_tokens = _tokens(memory["content"]) | set(memory.get("keywords") or [])
        overlap = len(query_tokens & memory_tokens) / max(1, len(query_tokens | memory_tokens))
        scope_bonus = 0.2 if memory["project_id"] == project_id else 0
        user_bonus = 0.1 if user_id and memory.get("user_id") == user_id else 0
        type_bonus = 0.08 if memory["memory_type"] == "procedural" else 0
        score = overlap + scope_bonus + user_bonus + type_bonus + float(memory["confidence"]) * 0.1
        if overlap or memory["memory_type"] == "procedural":
            ranked.append((score, memory))
    ranked.sort(key=lambda item: item[0], reverse=True)
    style = database.get_style_profile(project_id, user_id)
    template = database.get_active_template_profile(project_id)
    return {
        "scope": {"project_id": project_id, "user_id": user_id},
        "memories": [
            {
                "id": item["id"],
                "type": item["memory_type"],
                "content": item["content"],
                "confidence": item["confidence"],
                "source_ids": item["source_ids"],
            }
            for _, item in ranked[:limit]
        ],
        "style_profile": style,
        "template_profile": template,
    }


def quality_suggestions(
    requirements: str,
    cases: list[GeneratedCase],
    memory_context: dict[str, Any] | None = None,
) -> list[AgentSuggestion]:
    if not cases:
        return []
    suggestions: list[AgentSuggestion] = []
    combined = "\n".join(
        f"{case.title}\n{case.test_steps}\n{case.expected_result}\n{case.requirement}" for case in cases
    ).lower()
    if not any(term in combined for term in _NEGATIVE_TERMS):
        suggestions.append(
            AgentSuggestion(
                category="coverage",
                severity="warning",
                title="Add negative-path coverage",
                detail="No explicit invalid, rejected, or failure-path case was detected in the draft.",
                evidence=["Generated suite text contains no recognized negative-path terms."],
                confidence=0.78,
            )
        )
    if any(term in requirements.lower() for term in ("length", "limit", "minimum", "maximum", "至少", "最多", "长度")) and not any(
        term in combined for term in _BOUNDARY_TERMS
    ):
        suggestions.append(
            AgentSuggestion(
                category="coverage",
                severity="warning",
                title="Add boundary-value cases",
                detail="The requirements contain limits, but the suite does not clearly label boundary coverage.",
                evidence=["A limit term appears in the requirements."],
                confidence=0.82,
            )
        )
    title_groups: dict[str, list[GeneratedCase]] = {}
    for case in cases:
        normalized = re.sub(r"\W+", "", case.title.lower())
        title_groups.setdefault(normalized, []).append(case)
    for duplicates in title_groups.values():
        if len(duplicates) > 1:
            suggestions.append(
                AgentSuggestion(
                    category="quality",
                    severity="warning",
                    title="Review duplicate cases",
                    detail=f"{len(duplicates)} cases have the same normalized title.",
                    related_case_ids=[case.case_id for case in duplicates],
                    confidence=0.95,
                )
            )
    weak = [case for case in cases if len(case.expected_result.strip()) < 8]
    if weak:
        suggestions.append(
            AgentSuggestion(
                category="quality",
                severity="info",
                title="Make expected results observable",
                detail=f"{len(weak)} case(s) have very short expected results that may be hard to verify.",
                related_case_ids=[case.case_id for case in weak],
                confidence=0.72,
            )
        )
    if memory_context and not memory_context.get("style_profile"):
        suggestions.append(
            AgentSuggestion(
                category="memory",
                severity="info",
                title="Teach this project its preferred style",
                detail="Upload approved historical cases to learn the project's template and writing style.",
                confidence=0.98,
            )
        )
    return suggestions[:6]
