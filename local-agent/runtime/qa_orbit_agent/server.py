from __future__ import annotations

import hmac
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from . import __version__
from .browser_use_runner import BrowserUseRunner
from .models import Task
from .store import TaskStore


class AgentService:
    def __init__(self, workspace_root: Path):
        self.store = TaskStore(workspace_root)
        self.runner = BrowserUseRunner(self.store)
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="browser-run")

    def submit(self, payload: dict) -> Task:
        task = self.store.add(Task.from_payload(payload))
        self.store.update(task, log="Run accepted by local agent")
        self.pool.submit(self.runner.run, task)
        return task

    def cancel(self, task_id: str) -> Task | None:
        task = self.store.get(task_id)
        if task and task.status in {"queued", "running"}:
            task.cancel_requested = True
            self.store.update(task, log="Cancellation requested")
        return task


def create_handler(service: AgentService, token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "QAOrbitAgent/0.1"

        def _cors(self) -> None:
            origin = self.headers.get("Origin", "null")
            allowed = origin == "null" or origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")
            self.send_header("Access-Control-Allow-Origin", origin if allowed else "null")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Vary", "Origin")

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
            return bool(token) and hmac.compare_digest(supplied, token)

        def _require_auth(self) -> bool:
            if self._authorized():
                return True
            self._json(401, {"error": "Invalid or missing pairing token"})
            return False

        def _payload(self) -> dict:
            length = min(int(self.headers.get("Content-Length", "0")), 1_000_000)
            return json.loads(self.rfile.read(length) or b"{}")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if not self._require_auth():
                return
            path = urlparse(self.path).path
            if path == "/health":
                self._json(200, {"status": "ready", "version": __version__, "capabilities": ["browser-use", "isolated-profile", "cancel"]})
            elif path == "/api/tasks":
                self._json(200, {"tasks": [task.to_dict() for task in service.store.list()]})
            elif path.startswith("/api/tasks/"):
                task = service.store.get(path.rsplit("/", 1)[-1])
                self._json(200, {"task": task.to_dict()}) if task else self._json(404, {"error": "Task not found"})
            else:
                self._json(404, {"error": "Not found"})

        def do_POST(self):
            if not self._require_auth():
                return
            path = urlparse(self.path).path
            try:
                if path == "/api/tasks":
                    task = service.submit(self._payload())
                    self._json(202, {"task": task.to_dict()})
                elif path.startswith("/api/tasks/") and path.endswith("/cancel"):
                    task_id = path.split("/")[-2]
                    task = service.cancel(task_id)
                    self._json(200, {"task": task.to_dict()}) if task else self._json(404, {"error": "Task not found"})
                else:
                    self._json(404, {"error": "Not found"})
            except (ValueError, json.JSONDecodeError) as exc:
                self._json(400, {"error": str(exc)})

        def log_message(self, fmt, *args):
            print(f"{self.address_string()} - {fmt % args}")

    return Handler


def serve(port: int, token: str, workspace_root: Path) -> None:
    service = AgentService(workspace_root)
    server = ThreadingHTTPServer(("127.0.0.1", port), create_handler(service, token))
    print(f"QA Orbit Agent {__version__} listening on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        service.pool.shutdown(wait=False, cancel_futures=True)
