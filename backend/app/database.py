from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .models import ImportedCase


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DB_PATH = DATA_DIR / "qa-orbit-agent.sqlite"


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS import_sessions (
              id TEXT PRIMARY KEY, filename TEXT NOT NULL, status TEXT NOT NULL,
              preview_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS imported_cases (
              id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL,
              import_order INTEGER NOT NULL, case_id TEXT NOT NULL,
              payload_json TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(import_id, import_order)
            );
            CREATE TABLE IF NOT EXISTS audit_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL,
              action TEXT NOT NULL, detail_json TEXT NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL,
              role TEXT NOT NULL, content TEXT NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


def save_preview(import_id: str, filename: str, preview: dict[str, Any]) -> None:
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO import_sessions(id, filename, status, preview_json) VALUES(?,?,?,?)",
            (import_id, filename, "preview", json.dumps(preview, ensure_ascii=False)),
        )
        db.execute("DELETE FROM imported_cases WHERE import_id = ?", (import_id,))
        for payload in preview.get("cases", []):
            case = ImportedCase.model_validate(payload)
            db.execute(
                "INSERT INTO imported_cases(import_id, import_order, case_id, payload_json) VALUES(?,?,?,?)",
                (import_id, case.import_order, case.case_id, case.model_dump_json()),
            )


def get_session(import_id: str) -> sqlite3.Row | None:
    with connect() as db:
        return db.execute("SELECT * FROM import_sessions WHERE id = ?", (import_id,)).fetchone()


def confirm_import(import_id: str, cases: list[ImportedCase]) -> list[ImportedCase]:
    saved: list[ImportedCase] = []
    with connect() as db:
        for case in cases:
            cursor = db.execute(
                "INSERT OR REPLACE INTO imported_cases(import_id, import_order, case_id, payload_json) VALUES(?,?,?,?)",
                (import_id, case.import_order, case.case_id, case.model_dump_json()),
            )
            case.id = cursor.lastrowid + 900000
            db.execute(
                "UPDATE imported_cases SET payload_json = ? WHERE import_id = ? AND import_order = ?",
                (case.model_dump_json(), import_id, case.import_order),
            )
            saved.append(case)
        db.execute("UPDATE import_sessions SET status = 'confirmed' WHERE id = ?", (import_id,))
        db.execute(
            "INSERT INTO audit_events(import_id, action, detail_json) VALUES(?,?,?)",
            (import_id, "confirm_import", json.dumps({"count": len(saved)})),
        )
    return saved


def list_cases(import_id: str) -> list[ImportedCase]:
    with connect() as db:
        rows = db.execute(
            "SELECT payload_json FROM imported_cases WHERE import_id = ? ORDER BY import_order", (import_id,)
        ).fetchall()
    return [ImportedCase.model_validate_json(row["payload_json"]) for row in rows]


def get_case(import_id: str, import_order: int) -> ImportedCase | None:
    with connect() as db:
        row = db.execute(
            "SELECT payload_json FROM imported_cases WHERE import_id = ? AND import_order = ?",
            (import_id, import_order),
        ).fetchone()
    return ImportedCase.model_validate_json(row["payload_json"]) if row else None


def find_extra_key(case: ImportedCase, requested: str) -> str:
    normalized = "".join(character for character in requested.lower() if character.isalnum())
    for key in case.extra_fields:
        if "".join(character for character in key.lower() if character.isalnum()) == normalized:
            return key
    return requested


def update_case(import_id: str, import_order: int, field: str, value: Any) -> tuple[ImportedCase, Any]:
    case = get_case(import_id, import_order)
    if not case:
        raise ValueError(f"Import order {import_order} was not found")
    if field in type(case).model_fields and field not in {"id", "source_file", "source_sheet", "source_row", "import_order"}:
        before = getattr(case, field)
        setattr(case, field, value)
    else:
        extra_key = find_extra_key(case, field)
        before = case.extra_fields.get(extra_key)
        case.extra_fields[extra_key] = value
        field = extra_key
    detail = {"import_order": import_order, "case_id": case.case_id, "field": field, "before": before, "after": value}
    with connect() as db:
        db.execute(
            "UPDATE imported_cases SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE import_id = ? AND import_order = ?",
            (case.model_dump_json(), import_id, import_order),
        )
        db.execute(
            "INSERT INTO audit_events(import_id, action, detail_json) VALUES(?,?,?)",
            (import_id, "update_case", json.dumps(detail, ensure_ascii=False)),
        )
    return case, before


def undo_last(import_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT id, detail_json FROM audit_events WHERE import_id = ? AND action = 'update_case' ORDER BY id DESC LIMIT 1",
            (import_id,),
        ).fetchone()
    if not row:
        return None
    detail = json.loads(row["detail_json"])
    case, current = update_case(import_id, detail["import_order"], detail["field"], detail.get("before"))
    with connect() as db:
        db.execute("DELETE FROM audit_events WHERE id = ?", (row["id"],))
        db.execute("DELETE FROM audit_events WHERE id = (SELECT MAX(id) FROM audit_events WHERE import_id = ?)", (import_id,))
        db.execute(
            "INSERT INTO audit_events(import_id, action, detail_json) VALUES(?,?,?)",
            (import_id, "undo", json.dumps(detail, ensure_ascii=False)),
        )
    return {**detail, "before": current, "after": detail.get("before"), "case": case}


def save_message(import_id: str, role: str, content: str) -> None:
    with connect() as db:
        db.execute("INSERT INTO chat_messages(import_id, role, content) VALUES(?,?,?)", (import_id, role, content))


def message_history(import_id: str, limit: int = 20) -> list[dict[str, str]]:
    with connect() as db:
        rows = db.execute(
            "SELECT role, content FROM chat_messages WHERE import_id = ? ORDER BY id DESC LIMIT ?",
            (import_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]
