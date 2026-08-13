from __future__ import annotations

import json
import os

import httpx

from .llm import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from .models import CaseAssistRequest, CaseAssistResponse, STANDARD_FIELDS


EDITABLE_FIELDS = tuple(field for field in STANDARD_FIELDS if field != "case_id")


async def assist_case(request: CaseAssistRequest, request_api_key: str | None = None) -> CaseAssistResponse:
    api_key = (request_api_key or os.getenv("DEEPSEEK_API_KEY", "")).strip()
    if not api_key:
        raise RuntimeError("The AI service is not configured for this project.")
    payload = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "messages": [
            {"role": "system", "content": f"You are a senior QA engineer helping edit one test case. Return JSON only with message and changes. Allowed fields: {', '.join(EDITABLE_FIELDS)}. Keep case_type to Web, API, or Mobile; priority to P0, P1, or P2. Use newline-separated numbered test_steps. Do not invent a test_data name outside the provided available data sets. Never return or repeat credentials."},
            {"role": "user", "content": json.dumps({"request": request.message, "current_case": request.test_case, "available_data_sets": request.available_data_sets})},
        ],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{DEEPSEEK_BASE_URL}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=payload)
    if response.status_code == 401:
        raise RuntimeError("DeepSeek rejected the configured API key.")
    if not response.is_success:
        raise RuntimeError("DeepSeek could not update the case right now.")
    try:
        decision = json.loads(response.json().get("choices", [{}])[0].get("message", {}).get("content", "{}"))
    except (ValueError, TypeError, IndexError) as error:
        raise RuntimeError("The AI service returned an invalid case update.") from error
    changes = {field: str(value) for field, value in decision.get("changes", {}).items() if field in EDITABLE_FIELDS and value is not None}
    if changes.get("case_type") not in (None, "Web", "API", "Mobile"):
        changes.pop("case_type")
    if changes.get("priority") not in (None, "P0", "P1", "P2"):
        changes.pop("priority")
    if changes.get("test_data") and changes["test_data"] not in request.available_data_sets:
        changes.pop("test_data")
    if not changes:
        raise RuntimeError("AI did not return any safe case changes. Try a more specific request.")
    return CaseAssistResponse(message=str(decision.get("message") or "I updated the case draft for your review."), changes=changes)
