from __future__ import annotations

import json
import os
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from . import database, project_memory
from .llm import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from .models import (
    CasePatchOperation,
    GeneratedCase,
    GenerationChatRequest,
    GenerationDecision,
    GenerationFlowchart,
    GenerationFlowNode,
    GenerationQuestion,
    GenerationTurnResponse,
)

MAX_DOCUMENT_CHARS = 45_000
MAX_QUESTIONS = 4
MAX_CASES = 20

CASE_TYPES = {"Web", "API", "Mobile"}
PRIORITIES = {"P0", "P1", "P2"}

SYSTEM_PROMPT = (
    "You are a senior QA analyst helping an author turn product requirements into a reviewable test suite. "
    "You work interactively: before generating, ask only about gaps that materially change the test suite and "
    "cannot be inferred from the requirements. Typical gaps are the target platform (Web/API/Mobile), priority or "
    "severity expectations, key user roles or permissions, scope boundaries (must-have vs out of scope), "
    "environment or data constraints, and business rules the author implies but does not state. "
    "A project_context object may contain approved project memories, a learned style profile, a source template, "
    "and representative historical cases. Treat it as guidance, never as a reason to contradict the requirements. "
    "Follow its terminology and writing style when applicable, and never mix knowledge from another project. "
    "Never ask about anything already answered in the conversation or inferable from the requirements, and never "
    "ask more than 3 questions in one turn — prefer the smallest set that changes the suite.\n"
    "Return JSON only, with exactly this shape:\n"
    '{"action": "ask" | "generate", "message": string, "questions": [{"id": string, "question": string, '
    '"options": [string]}], "summary": string, "cases": [{"title": string, "case_type": "Web"|"API"|"Mobile", '
    '"priority": "P0"|"P1"|"P2", "preconditions": string, "test_steps": string, "expected_result": string, '
    '"requirement": string}], "flowchart": null | {"title": string, "nodes": [{"id": string, '
    '"label": string, "kind": "start"|"step"|"decision"|"end", "next": [string]}]}}\n'
    "Rules:\n"
    '- When action is "ask": message is a short reply to the author; provide 1-3 questions with unique ids (q1, q2, ...), '
    "each answerable in one sentence or by picking from options. Include options when a choice makes sense (for example "
    "the platform); omit options for free-text answers. Never return questions together with cases.\n"
    '- When action is "generate": produce 4-20 non-duplicative cases covering happy paths, validation, boundaries and '
    "supported failure handling. Every case needs title, case_type, priority, preconditions, numbered newline-separated "
    "test_steps, expected_result and a short requirement label. Never invent product behavior or credentials. "
    "summary is one sentence describing the suite.\n"
    '- For a complex requirement with multiple roles, states, integrations, or conditional outcomes, include a concise '
    'flowchart with 4-8 nodes so the author can verify the understood workflow. Use decision nodes for genuine branches; '
    'each next value must reference another node id. Return flowchart as null for simple requirements. The flowchart may '
    'accompany either ask or generate, but must only describe behavior supported by the requirements.\n'
)

POST_GENERATION_PROMPT = (
    "You are the QA Orbit generation agent, now working on an existing draft test suite the author is reviewing. "
    "The draft is provided as current_cases, numbered from case 1 in list order. The author may ask you to explain "
    "cases, change fields of a specific case, add new coverage, or remove cases.\n"
    "Return JSON only, with exactly this shape:\n"
    '{"action": "reply" | "update", "message": string, "operations": ['
    '{"op": "update", "case_id": string, "field": string, "value": any} | '
    '{"op": "remove", "case_id": string} | {"op": "add", "case": {"title": string, '
    '"case_type": "Web"|"API"|"Mobile", "priority": "P0"|"P1"|"P2", "preconditions": string, '
    '"test_steps": string, "expected_result": string, "requirement": string}}]}\n'
    "Rules:\n"
    '- When action is "reply": answer with message only (explanations, analysis, or a short reply). Do not include cases.\n'
    '- When action is "update": return only the minimum operations needed. Resolve a numbered reference against '
    "current_cases, then copy its exact case_id into the operation. Never return a complete rewritten suite. "
    "The server applies and validates operations, so untouched cases remain byte-for-byte unchanged. Keep case_type "
    "to Web/API/Mobile, priority to P0/P1/P2, and numbered newline-separated test_steps. Never invent credentials.\n"
)


def _coerce_questions(raw_questions: Any) -> list[GenerationQuestion]:
    if not isinstance(raw_questions, list):
        return []
    questions: list[GenerationQuestion] = []
    for index, raw in enumerate(raw_questions[:MAX_QUESTIONS], start=1):
        if not isinstance(raw, dict):
            continue
        question = str(raw.get("question") or "").strip()
        if not question:
            continue
        question_id = str(raw.get("id") or f"q{index}").strip() or f"q{index}"
        options = [str(option).strip() for option in (raw.get("options") or []) if str(option).strip()]
        questions.append(GenerationQuestion(id=question_id, question=question[:300], options=options[:6]))
    return questions


def _coerce_flowchart(raw_flowchart: Any) -> GenerationFlowchart | None:
    if not isinstance(raw_flowchart, dict):
        return None
    raw_nodes = raw_flowchart.get("nodes")
    if not isinstance(raw_nodes, list):
        return None
    nodes: list[GenerationFlowNode] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_nodes[:8], start=1):
        if not isinstance(raw, dict):
            continue
        node_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(raw.get("id") or f"step-{index}"))[:40]
        label = str(raw.get("label") or "").strip()[:160]
        if not node_id or not label or node_id in seen:
            continue
        kind = str(raw.get("kind") or "step").lower()
        if kind not in {"start", "step", "decision", "end"}:
            kind = "step"
        seen.add(node_id)
        nodes.append(GenerationFlowNode(id=node_id, label=label, kind=kind, next=[]))
    if len(nodes) < 3:
        return None
    valid_ids = {node.id for node in nodes}
    raw_by_id = {
        re.sub(r"[^a-zA-Z0-9_-]", "", str(raw.get("id") or f"step-{index}"))[:40]: raw
        for index, raw in enumerate(raw_nodes[:8], start=1)
        if isinstance(raw, dict)
    }
    for node in nodes:
        raw_next = raw_by_id.get(node.id, {}).get("next") or []
        node.next = [str(item) for item in raw_next if str(item) in valid_ids and str(item) != node.id][:3]
    title = str(raw_flowchart.get("title") or "Requirement flow").strip()[:120]
    return GenerationFlowchart(title=title or "Requirement flow", nodes=nodes)


def _coerce_case(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    title = str(item.get("title") or "").strip()
    steps = str(item.get("test_steps") or "").strip()
    expected = str(item.get("expected_result") or "").strip()
    if not title or not steps or not expected:
        return None
    case_type = str(item.get("case_type") or "Web").strip().capitalize()
    if case_type not in CASE_TYPES:
        case_type = "Web"
    priority = str(item.get("priority") or "P1").strip().upper()
    if priority not in PRIORITIES:
        priority = "P1"
    return {
        "title": title[:200],
        "case_type": case_type,
        "priority": priority,
        "preconditions": str(item.get("preconditions") or "").strip()[:1000],
        "test_steps": steps[:4000],
        "expected_result": expected[:2000],
        "requirement": str(item.get("requirement") or "").strip()[:300],
    }


def _coerce_operations(raw_operations: Any) -> list[CasePatchOperation]:
    if not isinstance(raw_operations, list):
        return []
    operations: list[CasePatchOperation] = []
    editable = {"title", "case_type", "priority", "preconditions", "test_steps", "expected_result", "requirement"}
    for raw in raw_operations[:MAX_CASES]:
        if not isinstance(raw, dict) or raw.get("op") not in {"add", "update", "remove"}:
            continue
        op = str(raw["op"])
        case_id = str(raw.get("case_id") or "").strip() or None
        index = raw.get("index") if isinstance(raw.get("index"), int) and raw.get("index") > 0 else None
        if op == "add":
            case = _coerce_case(raw.get("case"))
            if case:
                operations.append(CasePatchOperation(op="add", case=GeneratedCase(**case)))
        elif op == "remove" and (case_id or index):
            operations.append(CasePatchOperation(op="remove", case_id=case_id, index=index))
        elif op == "update" and (case_id or index) and raw.get("field") in editable:
            operations.append(
                CasePatchOperation(
                    op="update",
                    case_id=case_id,
                    index=index,
                    field=raw["field"],
                    value=raw.get("value"),
                )
            )
    return operations


def apply_case_operations(
    current_cases: list[GeneratedCase], operations: list[CasePatchOperation]
) -> list[GeneratedCase]:
    """Apply validated patches while preserving every untouched case and its stable ID."""
    cases = [case.model_copy(deep=True) for case in current_cases]
    for operation in operations:
        if operation.op == "add":
            if operation.case is None:
                raise ValueError("An add operation requires a complete case.")
            cases.append(operation.case.model_copy(deep=True))
            continue
        target = next(
            (index for index, case in enumerate(cases) if operation.case_id and case.case_id == operation.case_id),
            None,
        )
        if target is None and operation.index is not None and operation.index <= len(cases):
            target = operation.index - 1
        if target is None:
            raise ValueError(f"Patch target {operation.case_id or operation.index!r} was not found in the draft.")
        if operation.op == "remove":
            cases.pop(target)
            continue
        if operation.field is None:
            raise ValueError("An update operation requires an editable field.")
        payload = cases[target].model_dump()
        payload[operation.field] = operation.value
        cases[target] = GeneratedCase.model_validate(payload)
    if len(cases) > MAX_CASES:
        raise ValueError(f"A draft cannot contain more than {MAX_CASES} cases.")
    return cases


def _parse_decision(raw: Any) -> GenerationDecision:
    if not isinstance(raw, dict):
        raise RuntimeError("The AI service returned an invalid response.")
    action = str(raw.get("action") or "generate").strip().lower()
    message = str(raw.get("message") or "").strip()
    flowchart = _coerce_flowchart(raw.get("flowchart"))

    if action == "ask":
        questions = _coerce_questions(raw.get("questions"))
        if questions:
            return GenerationDecision(
                action="ask",
                message=message or "I need a little more detail before I can build the suite.",
                questions=questions,
                flowchart=flowchart,
            )
        # The model asked for clarification but returned no usable questions — do not dead-end the conversation.

    if action == "reply":
        return GenerationDecision(action="reply", message=message or "OK.", flowchart=flowchart)

    cases = [coerced for coerced in (_coerce_case(item) for item in (raw.get("cases") or [])) if coerced]
    cases = cases[:MAX_CASES]

    if action == "update":
        operations = _coerce_operations(raw.get("operations"))
        if operations:
            return GenerationDecision(
                action="update",
                message=message or f"Prepared {len(operations)} safe draft change(s).",
                operations=operations,
                flowchart=flowchart,
            )
        # An empty list is a legitimate outcome here: the author asked to remove cases.
        return GenerationDecision(
            action="update",
            message=message or (f"Updated the suite ({len(cases)} case(s) remaining)." if cases else "Removed the selected cases."),
            cases=[GeneratedCase(**case) for case in cases],
            flowchart=flowchart,
        )

    if not cases:
        raise RuntimeError("The AI service returned no clarifying questions or test cases. Try again or rephrase your requirements.")
    summary = str(raw.get("summary") or f"Generated {len(cases)} test cases.").strip()
    return GenerationDecision(
        action="generate",
        message=message or summary,
        summary=summary,
        cases=[GeneratedCase(**case) for case in cases],
        flowchart=flowchart,
    )


_CHINESE_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_ORDINAL_PATTERNS = (
    re.compile(r"第\s*([一二两三四五六七八九十百\d]+)\s*(?:条|个|号)"),
    re.compile(r"\b(?:case|row|用例|条)\s*#?\s*(\d+)\b", re.I),
    re.compile(r"\b(?:case|用例)\s*([一二两三四五六七八九十]+)\b"),
)


def _chinese_to_int(raw: str) -> int | None:
    """Convert Chinese numerals up to 99 (十, 二十, 二十一, ...) to an int."""
    raw = raw.strip()
    if raw in _CHINESE_DIGITS:
        return _CHINESE_DIGITS[raw]
    if raw == "十":
        return 10
    if raw.startswith("十"):
        return 10 + _CHINESE_DIGITS.get(raw[1:], 0)
    if "十" in raw:
        head, _, tail = raw.partition("十")
        if head in _CHINESE_DIGITS and (not tail or tail in _CHINESE_DIGITS):
            return _CHINESE_DIGITS[head] * 10 + (_CHINESE_DIGITS.get(tail, 0) if tail else 0)
    return None


def _extract_ordinal(message: str) -> int | None:
    """Extract a 1-based case number from phrases like 第二十条case, 第3条, case 20, row 4."""
    for pattern in _ORDINAL_PATTERNS:
        match = pattern.search(message)
        if not match:
            continue
        raw = match.group(1)
        value = int(raw) if raw.isdigit() else _chinese_to_int(raw)
        if value and value > 0:
            return value
    return None


def _deterministic_draft_change(request: GenerationChatRequest, cases: list[GeneratedCase]) -> GenerationDecision | None:
    """Apply exact, unambiguous draft edits without a model call.

    Precise "remove/delete case N" instructions (Chinese or English ordinals) are executed
    deterministically so the author's intent is never lost to model randomness. Anything
    fuzzier (adds, edits, explanations, combined requests) falls through to the model.
    """
    text = request.message.strip()
    if not text:
        return None
    if re.search(r"不要删|别删|don'?t\s+remove|do\s+not\s+remove|keep\s+case", text, re.I):
        return None
    if not re.search(r"删(?:除|掉)?|移除|去掉|remove|delete|drop", text, re.I):
        return None
    ordinal = _extract_ordinal(text)
    if ordinal is None:
        return None
    if re.search(r"add|增加|新增|补充|改成|改为|修改|更改为|explain|解释|说明|查|看", text, re.I):
        return None
    if ordinal > len(cases):
        return GenerationDecision(action="reply", message=f"The draft has {len(cases)} case(s) — there is no case {ordinal}.")
    removed = cases[ordinal - 1]
    updated = [case for index, case in enumerate(cases) if index != ordinal - 1]
    return GenerationDecision(
        action="update",
        message=f"Removed case {ordinal} ({removed.title}).",
        cases=updated,
    )


async def _call_model(api_key: str, messages: list[dict[str, str]]) -> GenerationDecision:
    payload = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code == 401:
        raise RuntimeError("DeepSeek rejected the configured API key.")
    if not response.is_success:
        raise RuntimeError("DeepSeek could not process the requirements right now.")
    try:
        content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
        raw = json.loads(content)
    except (ValueError, TypeError, IndexError) as error:
        raise RuntimeError("The AI service returned an invalid response.") from error
    return _parse_decision(raw)


async def _stream_model_events(api_key: str, messages: list[dict[str, str]]) -> AsyncIterator[tuple[str, Any]]:
    """Stream one DeepSeek turn with thinking enabled.

    Yields ("thinking", {"text": str}) events as the reasoning grows, then a single
    ("decision", GenerationDecision) event with the parsed final answer.
    """
    payload = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "thinking": {"type": "enabled"},
        "stream": True,
        "stream_options": {"include_usage": True},
        "messages": messages,
    }
    reasoning = ""
    content = ""
    reasoning_chunks = 0
    last_emitted_len = 0
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        ) as response:
            if response.status_code == 401:
                raise RuntimeError("DeepSeek rejected the configured API key.")
            if not response.is_success:
                raise RuntimeError("DeepSeek could not process the requirements right now.")
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                delta_reasoning = delta.get("reasoning_content")
                if delta_reasoning:
                    reasoning += delta_reasoning
                    reasoning_chunks += 1
                    # Batch thinking events so the frontend is not flooded per token.
                    if len(reasoning) - last_emitted_len >= 80 or reasoning_chunks % 30 == 0:
                        last_emitted_len = len(reasoning)
                        yield ("thinking", {"text": reasoning})
                if delta.get("content"):
                    content += delta.get("content")
    # Flush the reasoning tail so the persisted thinking is complete.
    if len(reasoning) > last_emitted_len:
        yield ("thinking", {"text": reasoning})
    if not content.strip():
        raise RuntimeError("The AI service returned an empty response.")
    try:
        raw = json.loads(content)
    except ValueError as error:
        raise RuntimeError("The AI service returned an invalid response.") from error
    yield ("decision", _parse_decision(raw))


def _require_api_key(request_api_key: str | None) -> str:
    api_key = (request_api_key or os.getenv("DEEPSEEK_API_KEY", "")).strip()
    if not api_key:
        raise RuntimeError("Add and verify a DeepSeek API key in Project settings before generating cases.")
    return api_key


def _context_payload(
    requirements_text: str,
    history: list[dict[str, Any]],
    latest_message: str = "",
    latest_answers: list[dict[str, str]] | None = None,
    current_cases: list[dict[str, Any]] | None = None,
    project_context: dict[str, Any] | None = None,
) -> str:
    return json.dumps(
        {
            "requirements": requirements_text,
            "conversation": history,
            "current_cases": current_cases or [],
            "latest_message": latest_message,
            "latest_answers": latest_answers or [],
            "project_context": project_context or {},
        },
        ensure_ascii=False,
    )


def _history_context(session_id: str) -> list[dict[str, Any]]:
    turns: list[dict[str, Any]] = []
    for item in database.generation_message_history(session_id):
        role = item["role"]
        try:
            data = json.loads(item["content"])
        except (ValueError, TypeError):
            data = {"message": item["content"]}
        if role == "assistant":
            turns.append(
                {
                    "role": "assistant",
                    "content": str(data.get("message") or ""),
                    "questions": [question.model_dump() for question in _coerce_questions(data.get("questions"))],
                }
            )
        else:
            turns.append(
                {
                    "role": "user",
                    "content": str(data.get("message") or ""),
                    "answers": data.get("answers") or [],
                }
            )
    return turns


def _state_from_decision(decision: GenerationDecision) -> dict[str, Any]:
    status = "asking" if decision.action == "ask" else "generated" if decision.action == "generate" else "working"
    return {
        "status": status,
        "action": decision.action,
        "message": decision.message,
        "questions": [question.model_dump() for question in decision.questions],
        "summary": decision.summary,
        "cases": [case.model_dump() for case in decision.cases],
        "operations": [operation.model_dump() for operation in decision.operations],
        "suggestions": [suggestion.model_dump() for suggestion in decision.suggestions],
        "flowchart": decision.flowchart.model_dump() if decision.flowchart else None,
    }


def _to_turn(session_id: str, decision: GenerationDecision) -> GenerationTurnResponse:
    if decision.action == "ask":
        return GenerationTurnResponse(
            session_id=session_id,
            status="asking",
            action="ask",
            message=decision.message,
            questions=decision.questions,
            flowchart=decision.flowchart,
        )
    if decision.action == "reply":
        return GenerationTurnResponse(session_id=session_id, status="working", action="reply", message=decision.message, flowchart=decision.flowchart)
    if decision.action == "update":
        return GenerationTurnResponse(
            session_id=session_id,
            status="working",
            action="update",
            message=decision.message,
            cases=decision.cases,
            operations=decision.operations,
            suggestions=decision.suggestions,
            flowchart=decision.flowchart,
        )
    return GenerationTurnResponse(
        session_id=session_id,
        status="generated",
        action="generate",
        message=decision.message,
        summary=decision.summary,
        cases=decision.cases,
        operations=decision.operations,
        suggestions=decision.suggestions,
        flowchart=decision.flowchart,
    )


def _with_quality_review(
    decision: GenerationDecision,
    requirements_text: str,
    memory_context: dict[str, Any],
) -> GenerationDecision:
    if decision.action in {"generate", "update"}:
        decision.suggestions = project_memory.quality_suggestions(
            requirements_text, decision.cases, memory_context
        )
    return decision


async def start_session(
    session_id: str,
    source: str,
    requirements_text: str,
    request_api_key: str | None = None,
    *,
    project_id: str = "default",
    user_id: str | None = None,
) -> GenerationTurnResponse:
    api_key = _require_api_key(request_api_key)
    requirements_text = requirements_text.strip()
    if not requirements_text:
        raise ValueError("Enter or upload some requirements first.")
    requirements_text = requirements_text[:MAX_DOCUMENT_CHARS]
    memory_context = project_memory.retrieve_context(project_id, user_id, requirements_text)
    decision = await _call_model(
        api_key,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _context_payload(requirements_text, [], project_context=memory_context)},
        ],
    )
    decision = _with_quality_review(decision, requirements_text, memory_context)
    database.create_generation_session(
        session_id,
        source,
        requirements_text,
        _state_from_decision(decision),
        project_id=project_id,
        user_id=user_id,
        memory_snapshot=memory_context,
    )
    preview = requirements_text if len(requirements_text) <= 600 else f"{requirements_text[:600]}…"
    database.save_generation_message(
        session_id,
        "user",
        json.dumps({"message": f"[Source: {source}]\n{preview}", "answers": []}, ensure_ascii=False),
    )
    database.save_generation_message(
        session_id,
        "assistant",
        json.dumps(
            {"message": decision.message, "questions": [question.model_dump() for question in decision.questions]},
            ensure_ascii=False,
        ),
    )
    return _to_turn(session_id, decision)


async def continue_session(
    session_id: str,
    request: GenerationChatRequest,
    request_api_key: str | None = None,
) -> GenerationTurnResponse:
    api_key = _require_api_key(request_api_key)
    row = database.get_generation_session(session_id)
    if not row:
        raise ValueError("Generation session was not found.")
    finished = row["status"] in ("generated", "working")
    if finished and not request.cases:
        # No draft was sent — this is a resume-style call: return the stored state without another model call.
        return session_state(session_id)
    if not request.cases and not request.message.strip() and not request.answers:
        raise ValueError("Answer the questions or type a message first.")
    history = _history_context(session_id)
    memory_context = json.loads(row["memory_snapshot_json"] or "{}")
    answers = [answer.model_dump() for answer in request.answers]
    if request.cases:
        prompt = POST_GENERATION_PROMPT
        payload = _context_payload(
            row["requirements_text"],
            history,
            request.message,
            answers,
            [case.model_dump() for case in request.cases],
            project_context=memory_context,
        )
        decision = _deterministic_draft_change(request, request.cases) or await _call_model(
            api_key, [{"role": "system", "content": prompt}, {"role": "user", "content": payload}]
        )
        if decision.operations:
            decision.cases = apply_case_operations(request.cases, decision.operations)
    else:
        prompt = SYSTEM_PROMPT
        payload = _context_payload(
            row["requirements_text"], history, request.message, answers, project_context=memory_context
        )
        decision = await _call_model(api_key, [{"role": "system", "content": prompt}, {"role": "user", "content": payload}])
    decision = _with_quality_review(decision, row["requirements_text"], memory_context)
    database.save_generation_message(
        session_id,
        "user",
        json.dumps({"message": request.message, "answers": answers}, ensure_ascii=False),
    )
    database.save_generation_message(
        session_id,
        "assistant",
        json.dumps(
            {"message": decision.message, "questions": [question.model_dump() for question in decision.questions]},
            ensure_ascii=False,
        ),
    )
    database.update_generation_session(session_id, _state_from_decision(decision))
    return _to_turn(session_id, decision)


def session_state(session_id: str) -> GenerationTurnResponse | None:
    row = database.get_generation_session(session_id)
    if not row:
        return None
    state = json.loads(row["state_json"])
    status = state.get("status", "asking")
    return GenerationTurnResponse(
        session_id=session_id,
        status=status,
        action=str(state.get("action") or ("ask" if status == "asking" else "generate")),
        message=str(state.get("message") or ""),
        questions=[GenerationQuestion.model_validate(item) for item in state.get("questions") or []],
        summary=str(state.get("summary") or ""),
        cases=[GeneratedCase.model_validate(item) for item in state.get("cases") or []],
        operations=state.get("operations") or [],
        suggestions=state.get("suggestions") or [],
        flowchart=GenerationFlowchart.model_validate(state["flowchart"]) if state.get("flowchart") else None,
    )


async def stream_create_events(
    session_id: str,
    source: str,
    requirements_text: str,
    request_api_key: str | None = None,
    *,
    project_id: str = "default",
    user_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stream a session-start turn: ("thinking", ...) events then ("result", ...)."""
    api_key = _require_api_key(request_api_key)
    requirements_text = requirements_text.strip()
    if not requirements_text:
        raise ValueError("Enter or upload some requirements first.")
    requirements_text = requirements_text[:MAX_DOCUMENT_CHARS]
    memory_context = project_memory.retrieve_context(project_id, user_id, requirements_text)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _context_payload(requirements_text, [], project_context=memory_context)},
    ]
    decision: GenerationDecision | None = None
    async for event, data in _stream_model_events(api_key, messages):
        if event == "thinking":
            yield ("thinking", data)
        else:
            decision = data
    if decision is None:
        return
    decision = _with_quality_review(decision, requirements_text, memory_context)
    database.create_generation_session(
        session_id,
        source,
        requirements_text,
        _state_from_decision(decision),
        project_id=project_id,
        user_id=user_id,
        memory_snapshot=memory_context,
    )
    preview = requirements_text if len(requirements_text) <= 600 else f"{requirements_text[:600]}…"
    database.save_generation_message(
        session_id,
        "user",
        json.dumps({"message": f"[Source: {source}]\n{preview}", "answers": []}, ensure_ascii=False),
    )
    database.save_generation_message(
        session_id,
        "assistant",
        json.dumps(
            {"message": decision.message, "questions": [question.model_dump() for question in decision.questions]},
            ensure_ascii=False,
        ),
    )
    yield ("result", _to_turn(session_id, decision).model_dump(mode="json"))


async def stream_turn_events(
    session_id: str,
    request: GenerationChatRequest,
    request_api_key: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stream one continuation turn. Exact deletions stream only a result; model turns
    stream ("thinking", ...) events as the reasoning grows, then ("result", ...)."""
    api_key = _require_api_key(request_api_key)
    row = database.get_generation_session(session_id)
    if not row:
        raise ValueError("Generation session was not found.")
    finished = row["status"] in ("generated", "working")
    if finished and not request.cases:
        yield ("result", session_state(session_id).model_dump(mode="json"))
        return
    if not request.cases and not request.message.strip() and not request.answers:
        raise ValueError("Answer the questions or type a message first.")
    history = _history_context(session_id)
    memory_context = json.loads(row["memory_snapshot_json"] or "{}")
    answers = [answer.model_dump() for answer in request.answers]
    decision = _deterministic_draft_change(request, request.cases) if request.cases else None
    if decision is None:
        if request.cases:
            prompt = POST_GENERATION_PROMPT
            payload = _context_payload(
                row["requirements_text"],
                history,
                request.message,
                answers,
                [case.model_dump() for case in request.cases],
                project_context=memory_context,
            )
        else:
            prompt = SYSTEM_PROMPT
            payload = _context_payload(
                row["requirements_text"], history, request.message, answers, project_context=memory_context
            )
        async for event, data in _stream_model_events(
            api_key, [{"role": "system", "content": prompt}, {"role": "user", "content": payload}]
        ):
            if event == "thinking":
                yield ("thinking", data)
            else:
                decision = data
    if decision is None:
        return
    if decision.operations:
        decision.cases = apply_case_operations(request.cases, decision.operations)
    decision = _with_quality_review(decision, row["requirements_text"], memory_context)
    database.save_generation_message(
        session_id,
        "user",
        json.dumps({"message": request.message, "answers": answers}, ensure_ascii=False),
    )
    database.save_generation_message(
        session_id,
        "assistant",
        json.dumps(
            {"message": decision.message, "questions": [question.model_dump() for question in decision.questions]},
            ensure_ascii=False,
        ),
    )
    database.update_generation_session(session_id, _state_from_decision(decision))
    yield ("result", _to_turn(session_id, decision).model_dump(mode="json"))
