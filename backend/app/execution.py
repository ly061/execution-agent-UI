from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .models import RunCreateRequest


MOCK_DB_PATH = Path(__file__).resolve().parents[2] / "public" / "mock-data.sqlite"


def _connect_mock() -> sqlite3.Connection:
    if not MOCK_DB_PATH.exists():
        raise ValueError("The test management database is not available.")
    connection = sqlite3.connect(MOCK_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _rows(db: sqlite3.Connection, statement: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(statement, params).fetchall()]


def _case_ids_for_target(db: sqlite3.Connection, request: RunCreateRequest) -> list[int]:
    target = request.target
    if target.type in {"test_case", "rerun"}:
        if target.id is None:
            raise ValueError("A case id is required for this run target.")
        return [target.id]
    if target.type == "test_set":
        if target.id is None:
            raise ValueError("A test set id is required for this run target.")
        return [row["case_id"] for row in _rows(db, "SELECT case_id FROM set_cases WHERE set_id = ? ORDER BY case_id", (target.id,))]
    if target.type == "batch_test_set":
        if not target.ids:
            raise ValueError("At least one test set is required for a batch run.")
        placeholders = ",".join("?" for _ in target.ids)
        return [
            row["case_id"]
            for row in _rows(
                db,
                f"SELECT DISTINCT case_id FROM set_cases WHERE set_id IN ({placeholders}) ORDER BY case_id",
                tuple(target.ids),
            )
        ]
    if target.type == "test_plan":
        if target.id is None:
            raise ValueError("A test plan id is required for this run target.")
        rows = _rows(
            db,
            """
            SELECT case_id FROM plan_cases WHERE plan_id = ?
            UNION
            SELECT sc.case_id FROM plan_sets ps JOIN set_cases sc ON sc.set_id = ps.set_id WHERE ps.plan_id = ?
            EXCEPT
            SELECT case_id FROM plan_case_exclusions WHERE plan_id = ?
            ORDER BY case_id
            """,
            (target.id, target.id, target.id),
        )
        return [row["case_id"] for row in rows]
    raise ValueError(f"Unsupported run target: {target.type}")


def build_run_plan_snapshot(request: RunCreateRequest) -> dict[str, Any]:
    """Resolve the selected server-side entities into an immutable execution snapshot."""
    with _connect_mock() as db:
        case_ids = _case_ids_for_target(db, request)
        if not case_ids:
            raise ValueError("The selected target does not contain any test cases.")
        placeholders = ",".join("?" for _ in case_ids)
        cases = _rows(db, f"SELECT * FROM cases WHERE id IN ({placeholders}) ORDER BY id", tuple(case_ids))
        if len(cases) != len(set(case_ids)):
            raise ValueError("One or more selected test cases no longer exist.")
        application_row = db.execute("SELECT * FROM applications WHERE name = ?", (request.application,)).fetchone()
        application = dict(application_row) if application_row else {"name": request.application, "url": ""}
        data_sets: dict[str, Any] = {}
        for case in cases:
            data_set_name = case.get("test_data")
            if not data_set_name or data_set_name in data_sets:
                continue
            row = db.execute("SELECT * FROM data_sets WHERE name = ?", (data_set_name,)).fetchone()
            if row:
                payload = dict(row)
                try:
                    payload["preview"] = json.loads(payload.pop("preview_json") or "[]")
                except json.JSONDecodeError:
                    payload["preview"] = []
                data_sets[data_set_name] = payload

    return {
        "schema_version": 1,
        "target": request.target.model_dump(mode="json"),
        "application": application,
        "environment": request.environment,
        "build": request.build,
        "instructions": request.instructions,
        "cases": cases,
        "data_sets": data_sets,
        "execution": {
            "target": request.execution_target,
            "headless": request.headless,
            "max_steps": request.max_steps,
            "allowed_domains": request.allowed_domains,
            "capture_screenshots": request.capture_screenshots,
        },
    }
