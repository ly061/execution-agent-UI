from __future__ import annotations

import platform
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

from runtime.qa_orbit_agent.browser_use_runner import BrowserUseRunner
from runtime.qa_orbit_agent.models import Task
from runtime.qa_orbit_agent.store import TaskStore

from .api_client import AgentApiClient, AgentApiError


StateCallback = Callable[[str, str], None]
TasksCallback = Callable[[list[dict[str, Any]]], None]


class ServerAgentLoop:
    def __init__(
        self,
        server_url: str,
        api_key: str,
        device_id: str,
        device_name: str,
        workspace_root: Path,
        on_state: StateCallback,
        on_tasks: TasksCallback,
    ):
        self.client = AgentApiClient(server_url)
        self.api_key = api_key
        self.device = {
            "device_id": device_id,
            "device_name": device_name,
            "platform": platform.system().lower(),
            "agent_version": "0.2.0",
            "capabilities": {"browser_use": True, "headed_browser": True, "max_concurrency": 1},
        }
        self.store = TaskStore(workspace_root)
        self.runner = BrowserUseRunner(self.store)
        self.on_state = on_state
        self.on_tasks = on_tasks
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="server-run")
        self.active_future: Future[None] | None = None

    def start(self) -> None:
        self.thread = threading.Thread(target=self._run, name="agent-control-plane", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self.pool.shutdown(wait=False, cancel_futures=True)

    def _publish_tasks(self) -> None:
        self.on_tasks([task.to_dict() for task in self.store.list()])

    def _run(self) -> None:
        self.on_state("connecting", "Authenticating this device…")
        try:
            session = self.client.login(self.api_key, self.device)
            agent = session["agent"]
            self.on_state("online", f"Connected as {agent['device_name']}")
        except AgentApiError as error:
            self.on_state("error", str(error))
            return

        next_heartbeat = 0.0
        while not self.stop_event.is_set():
            try:
                now = time.monotonic()
                if now >= next_heartbeat:
                    self.client.heartbeat()
                    next_heartbeat = now + 15
                if self.active_future is None:
                    plan = self.client.claim()
                    if plan:
                        self.active_future = self.pool.submit(self._execute, plan)
                elif self.active_future.done():
                    future = self.active_future
                    self.active_future = None
                    future.result()
                self._publish_tasks()
            except AgentApiError as error:
                if error.status == 401:
                    try:
                        self.client.login(self.api_key, self.device)
                    except AgentApiError as login_error:
                        self.on_state("error", str(login_error))
                        return
                else:
                    self.on_state("degraded", str(error))
            except Exception as error:  # Keep the control loop observable instead of silently dying.
                self.on_state("error", str(error))
            self.stop_event.wait(2)

    def _execute(self, plan: dict[str, Any]) -> None:
        snapshot = plan["snapshot"]
        prompt = self._prompt(snapshot)
        execution = snapshot.get("execution", {})
        task = Task.from_payload(
            {
                "title": snapshot.get("target", {}).get("name") or "Server Run Plan",
                "prompt": prompt,
                "allowed_domains": execution.get("allowed_domains", []),
                "headless": execution.get("headless", False),
                "max_steps": execution.get("max_steps", 50),
            }
        )
        task.run_plan_id = plan["id"]
        self.store.add(task)
        self.client.update_status(plan["id"], "running", logs=task.logs)
        self.on_state("busy", f"Running {task.title}")
        self.runner.run(task)
        terminal = task.status if task.status in {"completed", "failed", "cancelled"} else "interrupted"
        self.client.update_status(
            plan["id"], terminal, result=task.result, error=task.error, logs=task.logs
        )
        self._publish_tasks()
        self.on_state("online", "Waiting for the next Run Plan")

    @staticmethod
    def _prompt(snapshot: dict[str, Any]) -> str:
        application = snapshot.get("application", {})
        parts = [
            snapshot.get("instructions") or "Execute the supplied QA Orbit test cases.",
            f"Application: {application.get('name', '')}",
            f"URL: {application.get('url', '')}",
            f"Environment: {snapshot.get('environment', '')}",
        ]
        for index, case in enumerate(snapshot.get("cases", []), start=1):
            data = snapshot.get("data_sets", {}).get(case.get("test_data"), {})
            parts.extend(
                [
                    f"\nCase {index}: {case.get('title', '')}",
                    f"Preconditions: {case.get('preconditions', '')}",
                    f"Steps:\n{case.get('test_steps', '')}",
                    f"Expected result: {case.get('expected_result', '')}",
                    f"Test data: {data.get('preview', case.get('test_data', ''))}",
                ]
            )
        return "\n".join(parts)
