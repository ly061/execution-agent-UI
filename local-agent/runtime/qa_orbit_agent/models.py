from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Task:
    prompt: str
    title: str = "Browser task"
    allowed_domains: list[str] = field(default_factory=list)
    headless: bool = False
    max_steps: int = 50
    id: str = field(default_factory=lambda: str(uuid4()))
    status: str = "queued"
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    workspace: str = ""
    logs: list[str] = field(default_factory=list)
    result: str = ""
    error: str = ""
    cancel_requested: bool = False

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Task":
        prompt = str(payload.get("prompt", "")).strip()
        if not prompt:
            raise ValueError("prompt is required")
        domains = payload.get("allowed_domains") or []
        if not isinstance(domains, list) or not all(isinstance(item, str) for item in domains):
            raise ValueError("allowed_domains must be a list of strings")
        max_steps = max(1, min(int(payload.get("max_steps", 50)), 100))
        return cls(
            prompt=prompt,
            title=str(payload.get("title") or prompt[:64]),
            allowed_domains=[item.strip() for item in domains if item.strip()],
            headless=bool(payload.get("headless", False)),
            max_steps=max_steps,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def set_workspace(self, root: Path) -> None:
        self.workspace = str((root / self.id).resolve())
