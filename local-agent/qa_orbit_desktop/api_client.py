from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


class AgentApiError(RuntimeError):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class AgentApiClient:
    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip("/")
        self.access_token = ""

    def _request(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        request = urllib.request.Request(
            f"{self.server_url}{path}", data=body, headers=headers, method="POST" if payload is not None else "GET"
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read() or b"{}").get("detail")
            except (json.JSONDecodeError, AttributeError):
                detail = None
            raise AgentApiError(detail or f"Server returned {error.code}", error.code) from error
        except urllib.error.URLError as error:
            raise AgentApiError(f"Cannot reach Execution Agent Server: {error.reason}") from error

    def login(self, api_key: str, device: dict[str, Any]) -> dict[str, Any]:
        response = self._request("/api/agent/v1/sessions", {"api_key": api_key, **device})
        self.access_token = response["access_token"]
        return response

    def heartbeat(self) -> dict[str, Any]:
        return self._request("/api/agent/v1/heartbeat", {})

    def claim(self) -> dict[str, Any] | None:
        return self._request("/api/agent/v1/run-plans/claim", {"lease_seconds": 120}).get("run_plan")

    def update_status(
        self,
        run_plan_id: str,
        status: str,
        *,
        result: str = "",
        error: str = "",
        logs: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._request(
            f"/api/agent/v1/run-plans/{run_plan_id}/status",
            {"status": status, "result": result, "error": error, "logs": logs or []},
        )
