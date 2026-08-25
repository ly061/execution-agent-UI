import json

from fastapi.testclient import TestClient

from app import database, generation_agent
from app.main import app


database.init_db()
client = TestClient(app)

ASK_DECISION = {
    "action": "ask",
    "message": "Before I build the suite, I need to know the target platform.",
    "questions": [
        {"id": "q1", "question": "Which platform should the cases target?", "options": ["Web", "API", "Mobile"]},
        {"id": "q2", "question": "What priority should the login flow be?"},
    ],
}

GENERATE_DECISION = {
    "action": "generate",
    "message": "I built 3 cases from your requirements.",
    "summary": "3 cases covering the login flow.",
    "cases": [
        {
            "title": "User signs in with valid credentials",
            "case_type": "Web",
            "priority": "P0",
            "preconditions": "User has an account",
            "test_steps": "1. Open the login page\n2. Enter credentials\n3. Submit",
            "expected_result": "User is signed in",
            "requirement": "Login with valid credentials",
        }
    ],
}


def test_generation_session_requires_text_or_file():
    response = client.post(
        "/api/generation/sessions",
        headers={"X-DeepSeek-API-Key": "test-key"},
        files={},
    )
    assert response.status_code == 400


def test_generation_session_requires_api_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    response = client.post(
        "/api/generation/sessions",
        data={"text": "Users can sign in with valid credentials."},
    )
    assert response.status_code == 503
    assert "API key" in response.json()["detail"]


def test_start_session_asks_clarifying_questions(monkeypatch):
    async def fake_call_model(api_key, messages):
        assert api_key == "test-key"
        assert messages[0]["role"] == "system"
        return generation_agent._parse_decision(ASK_DECISION)

    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    response = client.post(
        "/api/generation/sessions",
        data={"text": "Users can sign in with valid credentials."},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "asking"
    assert body["message"].startswith("Before I build")
    assert [question["id"] for question in body["questions"]] == ["q1", "q2"]
    assert body["cases"] == []

    # The session must be persisted so the conversation can continue.
    state = client.get(f"/api/generation/sessions/{body['session_id']}")
    assert state.status_code == 200
    assert state.json()["status"] == "asking"


def test_continue_session_generates_cases(monkeypatch):
    calls = []

    async def fake_call_model(api_key, messages):
        calls.append(messages[-1]["content"])
        if len(calls) == 1:
            return generation_agent._parse_decision(ASK_DECISION)
        # The continuation payload carries the requirements plus the answered questions.
        assert "sign in" in calls[-1]
        assert '"question_id": "q1"' in calls[-1]
        return generation_agent._parse_decision(GENERATE_DECISION)

    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    started = client.post(
        "/api/generation/sessions",
        data={"text": "Users can sign in with valid credentials. Password must be at least 8 characters."},
        headers={"X-DeepSeek-API-Key": "test-key"},
    ).json()
    assert started["status"] == "asking"
    response = client.post(
        f"/api/generation/sessions/{started['session_id']}/chat",
        json={"message": "", "answers": [{"question_id": "q1", "answer": "Web"}]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generated"
    assert len(body["cases"]) == 1
    assert body["cases"][0]["case_type"] == "Web"
    assert body["summary"].startswith("3 cases")

    # A finished session returns its stored state without another model call.
    calls_before = len(calls)
    again = client.post(
        f"/api/generation/sessions/{started['session_id']}/chat",
        json={"message": "one more thing"},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert again.status_code == 200
    assert again.json()["status"] == "generated"
    assert len(calls) == calls_before


def test_continue_session_rejects_empty_turn(monkeypatch):
    async def fake_call_model(api_key, messages):
        return generation_agent._parse_decision(ASK_DECISION)

    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    started = client.post(
        "/api/generation/sessions",
        data={"text": "Users can sign in."},
        headers={"X-DeepSeek-API-Key": "test-key"},
    ).json()
    response = client.post(
        f"/api/generation/sessions/{started['session_id']}/chat",
        json={"message": "", "answers": []},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 400


def test_parse_decision_coerces_case_values():
    decision = generation_agent._parse_decision(
        {
            "action": "generate",
            "cases": [
                {
                    "title": "  Edge test  ",
                    "case_type": "mobile",
                    "priority": "p2",
                    "test_steps": "1. Do the thing",
                    "expected_result": "Thing is done",
                }
            ],
        }
    )
    case = decision.cases[0]
    assert case.title == "Edge test"
    assert case.case_type == "Mobile"
    assert case.priority == "P2"


def test_parse_decision_falls_back_to_generate_when_questions_empty():
    import pytest

    with pytest.raises(RuntimeError, match="no clarifying questions or test cases"):
        generation_agent._parse_decision({"action": "ask", "message": "hm", "questions": [{"id": "q1", "question": ""}]})


def test_parse_decision_keeps_a_valid_complex_requirement_flowchart():
    decision = generation_agent._parse_decision(
        {
            **GENERATE_DECISION,
            "flowchart": {
                "title": "Claim approval flow",
                "nodes": [
                    {"id": "start", "label": "Submit claim", "kind": "start", "next": ["review"]},
                    {"id": "review", "label": "Review eligibility", "kind": "decision", "next": ["approved", "missing"]},
                    {"id": "approved", "label": "Schedule payment", "kind": "end", "next": []},
                    {"id": "missing", "label": "Request documents", "kind": "step", "next": ["review", "unknown"]},
                ],
            },
        }
    )

    assert decision.flowchart is not None
    assert decision.flowchart.title == "Claim approval flow"
    assert decision.flowchart.nodes[1].kind == "decision"
    assert decision.flowchart.nodes[-1].next == ["review"]  # unknown node references are removed


def _generated_session(monkeypatch) -> str:
    """Create a session and answer its questions until the suite is generated."""

    calls = []

    async def fake_call_model(api_key, messages):
        calls.append(messages[-1]["content"])
        return generation_agent._parse_decision(GENERATE_DECISION if len(calls) > 1 else ASK_DECISION)

    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    started = client.post(
        "/api/generation/sessions",
        data={"text": "Users can sign in with valid credentials."},
        headers={"X-DeepSeek-API-Key": "test-key"},
    ).json()
    answered = client.post(
        f"/api/generation/sessions/{started['session_id']}/chat",
        json={"message": "", "answers": [{"question_id": "q1", "answer": "Web"}]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    ).json()
    assert answered["status"] == "generated"
    return started["session_id"]


def test_post_generation_chat_explains_case(monkeypatch):
    session_id = _generated_session(monkeypatch)

    async def fake_reply(api_key, messages):
        # The draft the author is reviewing must be in the payload.
        assert '"current_cases"' in messages[-1]["content"]
        return generation_agent._parse_decision(
            {"action": "reply", "message": "Case 1 verifies that valid credentials sign the user in."}
        )

    monkeypatch.setattr(generation_agent, "_call_model", fake_reply)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={
            "message": "Explain case 1",
            "cases": GENERATE_DECISION["cases"],
        },
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "reply"
    assert body["status"] == "working"
    assert "valid credentials" in body["message"]
    assert body["cases"] == []


def test_post_generation_chat_updates_cases(monkeypatch):
    session_id = _generated_session(monkeypatch)
    draft = GENERATE_DECISION["cases"]

    async def fake_update(api_key, messages):
        return generation_agent._parse_decision(
            {
                "action": "update",
                "message": "Removed case 1 and added a lockout case.",
                "cases": [
                    {
                        "title": "Account locks after 5 failed attempts",
                        "case_type": "Web",
                        "priority": "P1",
                        "preconditions": "User has an account",
                        "test_steps": "1. Enter a wrong password 5 times\n2. Submit",
                        "expected_result": "The account is locked",
                        "requirement": "Login lockout",
                    }
                ],
            }
        )

    monkeypatch.setattr(generation_agent, "_call_model", fake_update)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={"message": "Remove case 1 and add a lockout case", "cases": draft},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "update"
    assert body["status"] == "working"
    assert len(body["cases"]) == 1
    assert "locks" in body["cases"][0]["title"].lower()
    # The updated draft is persisted so a resume returns it.
    state = client.get(f"/api/generation/sessions/{session_id}")
    assert state.json()["action"] == "update"
    assert len(state.json()["cases"]) == 1


def test_post_generation_update_allows_empty_suite(monkeypatch):
    session_id = _generated_session(monkeypatch)

    async def fake_update(api_key, messages):
        return generation_agent._parse_decision(
            {"action": "update", "message": "Removed every case as requested.", "cases": []}
        )

    monkeypatch.setattr(generation_agent, "_call_model", fake_update)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={"message": "Remove all cases", "cases": GENERATE_DECISION["cases"]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    assert response.json()["action"] == "update"
    assert response.json()["cases"] == []


def test_extract_ordinal_formats():
    assert generation_agent._extract_ordinal("删掉第二十条case") == 20
    assert generation_agent._extract_ordinal("删除第3条") == 3
    assert generation_agent._extract_ordinal("移除第 21 个") == 21
    assert generation_agent._extract_ordinal("delete case 20") == 20
    assert generation_agent._extract_ordinal("remove row 4") == 4
    assert generation_agent._extract_ordinal("remove case 十") == 10
    assert generation_agent._extract_ordinal("remove duplicates") is None
    assert generation_agent._extract_ordinal("add an edge case") is None


def test_deterministic_delete_chinese_does_not_call_model(monkeypatch):
    calls = []

    async def fake_call_model(api_key, messages):
        calls.append(messages)
        return generation_agent._parse_decision({"action": "reply", "message": "unexpected model call"})

    session_id = _generated_session(monkeypatch)
    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)

    draft = GENERATE_DECISION["cases"]
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={"message": "删掉第一条case", "cases": draft},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "update"
    assert body["status"] == "working"
    assert len(body["cases"]) == 0  # the only case was removed
    assert "Removed case 1" in body["message"]
    assert not calls  # executed deterministically, the model was never consulted

    # The deterministic result is persisted like any other turn.
    state = client.get(f"/api/generation/sessions/{session_id}")
    assert state.json()["cases"] == []


def test_deterministic_delete_out_of_range_replies(monkeypatch):
    async def fake_call_model(api_key, messages):
        raise AssertionError("model should not be called for out-of-range deletion")

    session_id = _generated_session(monkeypatch)
    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={"message": "remove case 99", "cases": GENERATE_DECISION["cases"]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "reply"
    assert "no case 99" in body["message"]


def test_deterministic_delete_falls_through_for_combined_requests(monkeypatch):
    calls = []

    async def fake_call_model(api_key, messages):
        calls.append(messages)
        return generation_agent._parse_decision(
            {"action": "update", "message": "Removed case 1 and added a lockout case.", "cases": []}
        )

    session_id = _generated_session(monkeypatch)
    monkeypatch.setattr(generation_agent, "_call_model", fake_call_model)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat",
        json={"message": "remove case 1 and add a lockout case", "cases": GENERATE_DECISION["cases"]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    assert len(calls) == 1  # combined request went to the model
    assert response.json()["action"] == "update"


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for frame in body.split("\n\n"):
        if not frame.strip():
            continue
        event, data = "message", ""
        for line in frame.splitlines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data += line[5:].strip()
        if data:
            events.append((event, json.loads(data)))
    return events


def test_stream_chat_streams_thinking_then_result(monkeypatch):
    async def fake_stream(api_key, messages):
        yield ("thinking", {"text": "Analyzing the draft…"})
        yield ("thinking", {"text": "Analyzing the draft… Checking case 1 coverage."})
        yield (
            "decision",
            generation_agent._parse_decision(
                {"action": "reply", "message": "Case 1 verifies that valid credentials sign the user in."}
            ),
        )

    monkeypatch.setattr(generation_agent, "_stream_model_events", fake_stream)
    session_id = _generated_session(monkeypatch)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat/stream",
        json={"message": "Explain case 1", "cases": GENERATE_DECISION["cases"]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    events = _parse_sse(response.text)
    kinds = [event for event, _ in events]
    assert "thinking" in kinds
    assert kinds[-1] == "result"
    thinking_frames = [data for event, data in events if event == "thinking"]
    assert thinking_frames[-1]["text"] == "Analyzing the draft… Checking case 1 coverage."
    assert events[-1][1]["action"] == "reply"
    assert "valid credentials" in events[-1][1]["message"]


def test_stream_deterministic_delete_has_no_thinking(monkeypatch):
    async def fake_stream(api_key, messages):
        raise AssertionError("model stream should not run for deterministic deletion")

    monkeypatch.setattr(generation_agent, "_stream_model_events", fake_stream)
    session_id = _generated_session(monkeypatch)
    response = client.post(
        f"/api/generation/sessions/{session_id}/chat/stream",
        json={"message": "删掉第一条case", "cases": GENERATE_DECISION["cases"]},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert [event for event, _ in events] == ["result"]
    assert events[0][1]["action"] == "update"
    assert events[0][1]["cases"] == []


def test_stream_create_streams_thinking_then_questions(monkeypatch):
    async def fake_stream(api_key, messages):
        yield ("thinking", {"text": "The requirements lack a platform."})
        yield ("decision", generation_agent._parse_decision(ASK_DECISION))

    monkeypatch.setattr(generation_agent, "_stream_model_events", fake_stream)
    response = client.post(
        "/api/generation/sessions/stream",
        data={"text": "Users can sign in with valid credentials."},
        headers={"X-DeepSeek-API-Key": "test-key"},
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert [event for event, _ in events] == ["thinking", "result"]
    assert events[-1][1]["status"] == "asking"
    assert len(events[-1][1]["questions"]) == 2
    # the session is persisted and resumable
    state = client.get(f"/api/generation/sessions/{events[-1][1]['session_id']}")
    assert state.status_code == 200
