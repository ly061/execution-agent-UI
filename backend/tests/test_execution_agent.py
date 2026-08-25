from pathlib import Path

from fastapi.testclient import TestClient

from app import database
from app.main import app


def test_server_creates_plan_and_agent_claims_it(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "execution.sqlite")

    with TestClient(app) as client:
        created_key = client.post("/api/agent-keys", json={"name": "Developer Mac"})
        assert created_key.status_code == 201
        api_key = created_key.json()["api_key"]
        assert api_key.startswith("qao_agent_")

        rejected = client.post(
            "/api/agent/v1/sessions",
            json={"api_key": "qao_agent_invalid-key", "device_id": "device-1", "device_name": "Mac"},
        )
        assert rejected.status_code == 401

        session = client.post(
            "/api/agent/v1/sessions",
            json={
                "api_key": api_key,
                "device_id": "device-1",
                "device_name": "Developer Mac",
                "platform": "macos",
                "agent_version": "0.2.0",
                "capabilities": {"browser_use": True},
            },
        )
        assert session.status_code == 200
        headers = {"Authorization": f"Bearer {session.json()['access_token']}"}

        created_run = client.post(
            "/api/runs",
            json={
                "target": {"type": "test_case", "id": 163924, "name": "Submit a motor claim"},
                "application": "Claims Portal",
                "environment": "UAT",
                "build": "v8.12.0-rc3",
                "instructions": "Execute the case and capture evidence.",
                "execution_target": "local_agent",
            },
        )
        assert created_run.status_code == 201
        plan = created_run.json()["run_plan"]
        assert plan["status"] == "queued"
        assert plan["snapshot"]["cases"][0]["id"] == 163924
        assert plan["snapshot"]["application"]["url"].startswith("https://")

        claimed = client.post("/api/agent/v1/run-plans/claim", json={}, headers=headers)
        assert claimed.status_code == 200
        assert claimed.json()["run_plan"]["id"] == plan["id"]
        assert claimed.json()["run_plan"]["status"] == "assigned"

        no_second_plan = client.post("/api/agent/v1/run-plans/claim", json={}, headers=headers)
        assert no_second_plan.json()["run_plan"] is None

        completed = client.post(
            f"/api/agent/v1/run-plans/{plan['id']}/status",
            json={"status": "completed", "result": "Passed", "logs": ["Browser completed"]},
            headers=headers,
        )
        assert completed.status_code == 200
        assert completed.json()["run_plan"]["result"] == "Passed"

        listed = client.get("/api/run-plans")
        assert listed.json()["run_plans"][0]["status"] == "completed"


def test_agent_key_can_be_listed_and_revoked(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "agent-keys.sqlite")

    with TestClient(app) as client:
        created = client.post(
            "/api/agent-keys",
            json={"name": "Release Mac", "project_id": "project-001"},
        )
        assert created.status_code == 201
        key = created.json()

        listed = client.get("/api/agent-keys", params={"project_id": "project-001"})
        assert listed.status_code == 200
        summary = listed.json()["agent_keys"][0]
        assert summary["id"] == key["id"]
        assert summary["key_prefix"] == key["key_prefix"]
        assert "api_key" not in summary
        assert summary["revoked_at"] is None

        session = client.post(
            "/api/agent/v1/sessions",
            json={"api_key": key["api_key"], "device_id": "release-mac", "device_name": "Release Mac"},
        )
        assert session.status_code == 200
        headers = {"Authorization": f"Bearer {session.json()['access_token']}"}

        revoked = client.delete(f"/api/agent-keys/{key['id']}")
        assert revoked.status_code == 200
        assert revoked.json() == {"revoked": True}

        assert client.post("/api/agent/v1/heartbeat", headers=headers).status_code == 401
        assert client.post(
            "/api/agent/v1/sessions",
            json={"api_key": key["api_key"], "device_id": "release-mac", "device_name": "Release Mac"},
        ).status_code == 401

        after = client.get("/api/agent-keys", params={"project_id": "project-001"}).json()["agent_keys"][0]
        assert after["revoked_at"] is not None
        assert after["agent_count"] == 1
