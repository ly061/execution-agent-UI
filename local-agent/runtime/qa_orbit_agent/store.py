from __future__ import annotations

import json
import threading
from pathlib import Path

from .models import Task, utc_now


class TaskStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._tasks: dict[str, Task] = {}
        self._lock = threading.RLock()
        self._load_existing()

    def _load_existing(self) -> None:
        for task_file in self.root.glob("*/task.json"):
            try:
                payload = json.loads(task_file.read_text(encoding="utf-8"))
                task = Task(**payload)
                if task.status in {"queued", "running"}:
                    task.status = "interrupted"
                    task.logs.append(f"{utc_now()[11:19]}  Agent restarted before the run finished")
                self._tasks[task.id] = task
                self._save(task)
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                continue

    def add(self, task: Task) -> Task:
        task.set_workspace(self.root)
        Path(task.workspace).mkdir(parents=True, exist_ok=True)
        with self._lock:
            self._tasks[task.id] = task
            self._save(task)
        return task

    def get(self, task_id: str) -> Task | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list(self) -> list[Task]:
        with self._lock:
            return sorted(self._tasks.values(), key=lambda task: task.created_at, reverse=True)

    def update(self, task: Task, *, status: str | None = None, log: str | None = None) -> None:
        with self._lock:
            if status:
                task.status = status
            if log:
                task.logs.append(f"{utc_now()[11:19]}  {log}")
            task.updated_at = utc_now()
            self._save(task)

    def _save(self, task: Task) -> None:
        workspace = Path(task.workspace)
        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "task.json").write_text(json.dumps(task.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
