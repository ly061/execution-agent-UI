from __future__ import annotations

import re
from typing import Any

from langchain.agents import create_agent
from langchain.tools import tool

from . import database
from .llm import create_deepseek_model, deepseek_enabled
from .models import Change, ChatResponse, STANDARD_FIELDS


FIELD_ALIASES = {
    "case id": "case_id", "用例编号": "case_id", "case type": "case_type", "类型": "case_type",
    "description": "description", "描述": "description", "preconditions": "preconditions", "前置条件": "preconditions",
    "test steps": "test_steps", "步骤": "test_steps", "test data": "test_data", "测试数据": "test_data",
    "expected result": "expected_result", "预期结果": "expected_result", "priority": "priority", "优先级": "priority",
    "user name": "user_name", "username": "user_name", "用户名": "user_name",
}


def explain_import(import_id: str) -> str:
    session = database.get_session(import_id)
    if not session:
        return "Import session was not found."
    import json

    preview = json.loads(session["preview_json"])
    return "\n".join(preview.get("explanation", []))


def deterministic_chat(import_id: str, message: str) -> ChatResponse | None:
    text = message.strip()
    if re.search(r"\bundo\b|撤销|取消上次", text, re.I):
        result = database.undo_last(import_id)
        if not result:
            return ChatResponse(message="There is no case change to undo.")
        change = Change(case_id=result["case_id"], import_order=result["import_order"], field=result["field"], before=result["before"], after=result["after"])
        return ChatResponse(message=f"Undid the last change to case {result['import_order']}: {result['field']} is now {result['after']!r}.", changes=[change], cases=[result["case"].frontend()], can_undo=False)
    if re.search(r"怎么处理|how.*(import|process)|explain", text, re.I):
        return ChatResponse(message=explain_import(import_id), cases=[case.frontend() for case in database.list_cases(import_id)])
    order_match = re.search(r"(?:第\s*([一二三四五六七八九十百\d]+)\s*条|case\s*#?\s*(\d+)|row\s*(\d+))", text, re.I)
    if not order_match:
        return None
    raw_order = next(value for value in order_match.groups() if value)
    chinese = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    order = int(raw_order) if raw_order.isdigit() else chinese.get(raw_order)
    if not order:
        return None
    field = next((target for alias, target in FIELD_ALIASES.items() if alias.lower() in text.lower()), None)
    value_match = re.search(r"(?:应该(?:用|是)?|改成|改为|更新为|\buse\b|\bto\b|=)\s*[\"“']?([^\"”'，。,.]+)", text, re.I)
    if not field or not value_match:
        return None
    value = value_match.group(1).strip()
    case, before = database.update_case(import_id, order, field, value)
    change = Change(case_id=case.case_id, import_order=order, field=field, before=before, after=value)
    return ChatResponse(
        message=f"Updated case {order} ({case.case_id}, {case.source_sheet} / source row {case.source_row}). {field}: {before!r} → {value!r}. You can undo this change.",
        changes=[change], cases=[case.frontend()], can_undo=True,
    )


def model_chat(import_id: str, message: str) -> ChatResponse:
    if not deepseek_enabled():
        return ChatResponse(message="I could not identify an exact case, field, and value. Try: ‘第七条 case 的 user name 改为 Lisa’. Configure DEEPSEEK_API_KEY to enable more flexible language.")

    @tool
    def get_imported_cases() -> list[dict[str, Any]]:
        """List cases in the current import with order, source and values."""
        return [case.model_dump() for case in database.list_cases(import_id)]

    @tool
    def update_case_field(import_order: int, field: str, value: str) -> dict[str, Any]:
        """Update one field of one imported case. Unknown fields are safely stored as extra fields."""
        case, before = database.update_case(import_id, import_order, field, value)
        return {"case": case.model_dump(), "field": field, "before": before, "after": value}

    @tool
    def describe_import() -> str:
        """Explain how this workbook was processed and mapped."""
        return explain_import(import_id)

    agent = create_agent(
        model=create_deepseek_model(),
        tools=[get_imported_cases, update_case_field, describe_import],
        system_prompt=(
            "You are the QA Orbit import agent. Resolve ordinal references using import_order. "
            "For a clear single-case correction, call update_case_field directly, then state case ID, source sheet/row, old and new values. "
            "Never modify multiple cases unless the user explicitly requests it. Standard fields are " + ", ".join(STANDARD_FIELDS) + "."
        ),
    )
    history = database.message_history(import_id)
    result = agent.invoke({"messages": [*history, {"role": "user", "content": message}]}, config={"configurable": {"thread_id": import_id}})
    answer = result["messages"][-1].content
    return ChatResponse(message=answer if isinstance(answer, str) else str(answer), cases=[case.frontend() for case in database.list_cases(import_id)], can_undo=True)


def chat(import_id: str, message: str) -> ChatResponse:
    database.save_message(import_id, "user", message)
    response = deterministic_chat(import_id, message) or model_chat(import_id, message)
    database.save_message(import_id, "assistant", response.message)
    return response
