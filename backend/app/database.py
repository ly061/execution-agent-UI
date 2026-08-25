from __future__ import annotations

import json
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .models import ImportedCase


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DB_PATH = Path(os.getenv("QA_ORBIT_DB_PATH", DATA_DIR / "qa-orbit-agent.sqlite"))


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def _ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """Apply a small SQLite-compatible migration without replacing existing user data."""
    columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


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
            CREATE TABLE IF NOT EXISTS generation_sessions (
              id TEXT PRIMARY KEY, source TEXT NOT NULL,
              requirements_text TEXT NOT NULL, status TEXT NOT NULL,
              state_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS generation_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
              role TEXT NOT NULL, content TEXT NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS agent_api_keys (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, key_prefix TEXT NOT NULL,
              key_hash TEXT NOT NULL UNIQUE, project_id TEXT,
              created_at TEXT NOT NULL, revoked_at TEXT
            );
            CREATE TABLE IF NOT EXISTS agents (
              id TEXT PRIMARY KEY, api_key_id TEXT NOT NULL, device_id TEXT NOT NULL UNIQUE,
              device_name TEXT NOT NULL, platform TEXT NOT NULL, agent_version TEXT NOT NULL,
              capabilities_json TEXT NOT NULL, status TEXT NOT NULL,
              created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agent_sessions (
              token_hash TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
              created_at TEXT NOT NULL, expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS execution_runs (
              id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT,
              target_name TEXT NOT NULL, execution_target TEXT NOT NULL,
              application TEXT NOT NULL, environment TEXT NOT NULL,
              status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS run_plans (
              id TEXT PRIMARY KEY, run_id TEXT NOT NULL, status TEXT NOT NULL,
              assigned_agent_id TEXT, snapshot_json TEXT NOT NULL,
              result TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
              logs_json TEXT NOT NULL DEFAULT '[]', lease_expires_at TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS run_plan_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT, run_plan_id TEXT NOT NULL,
              event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_memories (
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT,
              memory_type TEXT NOT NULL, content TEXT NOT NULL,
              keywords_json TEXT NOT NULL DEFAULT '[]', confidence REAL NOT NULL,
              support_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL,
              source_ids_json TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_project_memories_scope
              ON project_memories(project_id, user_id, status, memory_type);
            CREATE TABLE IF NOT EXISTS style_profiles (
              project_id TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT '',
              profile_json TEXT NOT NULL, examples_json TEXT NOT NULL DEFAULT '[]',
              source_import_id TEXT NOT NULL, updated_at TEXT NOT NULL,
              PRIMARY KEY(project_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS template_profiles (
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
              source_import_id TEXT NOT NULL, filename TEXT NOT NULL,
              profile_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_template_profiles_project
              ON template_profiles(project_id, active, created_at);
            """
        )
        _ensure_column(db, "import_sessions", "project_id", "TEXT NOT NULL DEFAULT 'default'")
        _ensure_column(db, "import_sessions", "user_id", "TEXT")
        _ensure_column(db, "generation_sessions", "project_id", "TEXT NOT NULL DEFAULT 'default'")
        _ensure_column(db, "generation_sessions", "user_id", "TEXT")
        _ensure_column(db, "generation_sessions", "memory_snapshot_json", "TEXT NOT NULL DEFAULT '{}'")


def save_preview(
    import_id: str,
    filename: str,
    preview: dict[str, Any],
    project_id: str = "default",
    user_id: str | None = None,
) -> None:
    with connect() as db:
        db.execute(
            """INSERT OR REPLACE INTO import_sessions
               (id, filename, status, preview_json, project_id, user_id) VALUES(?,?,?,?,?,?)""",
            (import_id, filename, "preview", json.dumps(preview, ensure_ascii=False), project_id, user_id),
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


def create_generation_session(
    session_id: str,
    source: str,
    requirements_text: str,
    state: dict[str, Any],
    project_id: str = "default",
    user_id: str | None = None,
    memory_snapshot: dict[str, Any] | None = None,
) -> None:
    with connect() as db:
        db.execute(
            """INSERT OR REPLACE INTO generation_sessions
               (id, source, requirements_text, status, state_json, project_id, user_id, memory_snapshot_json)
               VALUES(?,?,?,?,?,?,?,?)""",
            (
                session_id,
                source,
                requirements_text,
                state.get("status", "asking"),
                json.dumps(state, ensure_ascii=False),
                project_id,
                user_id,
                json.dumps(memory_snapshot or {}, ensure_ascii=False),
            ),
        )


def get_generation_session(session_id: str) -> sqlite3.Row | None:
    with connect() as db:
        return db.execute("SELECT * FROM generation_sessions WHERE id = ?", (session_id,)).fetchone()


def update_generation_session(session_id: str, state: dict[str, Any]) -> None:
    with connect() as db:
        db.execute(
            "UPDATE generation_sessions SET status = ?, state_json = ? WHERE id = ?",
            (state.get("status", "asking"), json.dumps(state, ensure_ascii=False), session_id),
        )


def save_generation_message(session_id: str, role: str, content: str) -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO generation_messages(session_id, role, content) VALUES(?,?,?)",
            (session_id, role, content),
        )


def generation_message_history(session_id: str, limit: int = 30) -> list[dict[str, str]]:
    with connect() as db:
        rows = db.execute(
            "SELECT role, content FROM generation_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def save_memory(
    *,
    project_id: str,
    content: str,
    memory_type: str,
    user_id: str | None = None,
    confidence: float = 0.8,
    status: str = "candidate",
    source_ids: list[str] | None = None,
    keywords: list[str] | None = None,
    memory_id: str | None = None,
) -> dict[str, Any]:
    normalized = " ".join(content.split()).strip()
    if not normalized:
        raise ValueError("Memory content cannot be empty.")
    existing_id = None
    with connect() as db:
        existing = db.execute(
            """SELECT id, support_count FROM project_memories
               WHERE project_id = ? AND COALESCE(user_id, '') = COALESCE(?, '')
                 AND memory_type = ? AND lower(content) = lower(?) AND status != 'deprecated'
               LIMIT 1""",
            (project_id, user_id, memory_type, normalized),
        ).fetchone()
        now = utc_now()
        if existing:
            existing_id = existing["id"]
            db.execute(
                """UPDATE project_memories SET support_count = support_count + 1,
                   confidence = MAX(confidence, ?), status = ?, updated_at = ? WHERE id = ?""",
                (confidence, status, now, existing_id),
            )
        else:
            existing_id = memory_id or f"mem_{secrets.token_hex(8)}"
            db.execute(
                """INSERT INTO project_memories
                   (id, project_id, user_id, memory_type, content, keywords_json, confidence,
                    support_count, status, source_ids_json, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    existing_id,
                    project_id,
                    user_id,
                    memory_type,
                    normalized,
                    json.dumps(keywords or [], ensure_ascii=False),
                    confidence,
                    1,
                    status,
                    json.dumps(source_ids or [], ensure_ascii=False),
                    now,
                    now,
                ),
            )
    return get_memory(existing_id) or {}


def _memory_payload(row: sqlite3.Row) -> dict[str, Any]:
    payload = dict(row)
    payload["source_ids"] = json.loads(payload.pop("source_ids_json") or "[]")
    payload["keywords"] = json.loads(payload.pop("keywords_json") or "[]")
    return payload


def get_memory(memory_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM project_memories WHERE id = ?", (memory_id,)).fetchone()
    return _memory_payload(row) if row else None


def list_memories(
    project_id: str,
    *,
    user_id: str | None = None,
    statuses: tuple[str, ...] = ("active",),
    include_global: bool = True,
    limit: int = 100,
) -> list[dict[str, Any]]:
    projects = (project_id, "*") if include_global and project_id != "*" else (project_id,)
    project_marks = ",".join("?" for _ in projects)
    status_marks = ",".join("?" for _ in statuses)
    params: list[Any] = [*projects, *statuses]
    user_clause = "AND user_id IS NULL"
    if user_id:
        user_clause = "AND (user_id IS NULL OR user_id = ?)"
        params.append(user_id)
    params.append(limit)
    with connect() as db:
        rows = db.execute(
            f"""SELECT * FROM project_memories
                WHERE project_id IN ({project_marks}) AND status IN ({status_marks}) {user_clause}
                ORDER BY CASE WHEN project_id = ? THEN 0 ELSE 1 END,
                         support_count DESC, confidence DESC, updated_at DESC LIMIT ?""",
            [*params[:-1], project_id, params[-1]],
        ).fetchall()
    return [_memory_payload(row) for row in rows]


def update_memory_status(memory_id: str, status: str) -> dict[str, Any] | None:
    with connect() as db:
        existing = db.execute("SELECT id FROM project_memories WHERE id = ?", (memory_id,)).fetchone()
        if not existing:
            return None
        db.execute(
            "UPDATE project_memories SET status = ?, updated_at = ? WHERE id = ?",
            (status, utc_now(), memory_id),
        )
    return get_memory(memory_id)


def save_style_profile(
    project_id: str,
    profile: dict[str, Any],
    examples: list[dict[str, Any]],
    source_import_id: str,
    user_id: str | None = None,
) -> None:
    with connect() as db:
        db.execute(
            """INSERT INTO style_profiles(project_id,user_id,profile_json,examples_json,source_import_id,updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(project_id,user_id) DO UPDATE SET
                 profile_json=excluded.profile_json, examples_json=excluded.examples_json,
                 source_import_id=excluded.source_import_id, updated_at=excluded.updated_at""",
            (
                project_id,
                user_id or "",
                json.dumps(profile, ensure_ascii=False),
                json.dumps(examples, ensure_ascii=False),
                source_import_id,
                utc_now(),
            ),
        )


def get_style_profile(project_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            """SELECT * FROM style_profiles WHERE project_id = ? AND user_id IN (?, '')
               ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END LIMIT 1""",
            (project_id, user_id or "", user_id or ""),
        ).fetchone()
    if not row:
        return None
    profile = json.loads(row["profile_json"])
    profile["examples"] = json.loads(row["examples_json"] or "[]")
    profile["source_import_id"] = row["source_import_id"]
    return profile


def save_template_profile(project_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    with connect() as db:
        db.execute("UPDATE template_profiles SET active = 0 WHERE project_id = ?", (project_id,))
        db.execute(
            """INSERT INTO template_profiles
               (id,project_id,name,source_import_id,filename,profile_json,active,created_at)
               VALUES(?,?,?,?,?,?,1,?)""",
            (
                profile["id"],
                project_id,
                profile["name"],
                profile["source_import_id"],
                profile["filename"],
                json.dumps(profile, ensure_ascii=False),
                utc_now(),
            ),
        )
    return get_active_template_profile(project_id) or profile


def get_active_template_profile(project_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM template_profiles WHERE project_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        ).fetchone()
    if not row:
        return None
    profile = json.loads(row["profile_json"])
    profile["active"] = bool(row["active"])
    profile["created_at"] = row["created_at"]
    return profile


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_agent_api_key(name: str, project_id: str | None = None) -> dict[str, Any]:
    key_id = f"key_{secrets.token_hex(8)}"
    api_key = f"qao_agent_{secrets.token_urlsafe(32)}"
    created_at = utc_now()
    payload = {
        "id": key_id,
        "name": name,
        "api_key": api_key,
        "key_prefix": api_key[:20],
        "project_id": project_id,
        "created_at": created_at,
    }
    with connect() as db:
        db.execute(
            "INSERT INTO agent_api_keys(id,name,key_prefix,key_hash,project_id,created_at) VALUES(?,?,?,?,?,?)",
            (key_id, name, payload["key_prefix"], _hash_secret(api_key), project_id, created_at),
        )
    return payload


def list_agent_api_keys(project_id: str | None = None) -> list[dict[str, Any]]:
    where = "WHERE k.project_id = ?" if project_id else ""
    params: tuple[str, ...] = (project_id,) if project_id else ()
    with connect() as db:
        rows = db.execute(
            f"""
            SELECT k.id, k.name, k.key_prefix, k.project_id, k.created_at, k.revoked_at,
                   COUNT(a.id) AS agent_count, MAX(a.last_seen_at) AS last_used_at
            FROM agent_api_keys k
            LEFT JOIN agents a ON a.api_key_id = k.id
            {where}
            GROUP BY k.id, k.name, k.key_prefix, k.project_id, k.created_at, k.revoked_at
            ORDER BY k.created_at DESC
            """,
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def revoke_agent_api_key(key_id: str) -> bool:
    revoked_at = utc_now()
    with connect() as db:
        existing = db.execute("SELECT id FROM agent_api_keys WHERE id = ?", (key_id,)).fetchone()
        if not existing:
            return False
        db.execute(
            "UPDATE agent_api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
            (revoked_at, key_id),
        )
        db.execute(
            "DELETE FROM agent_sessions WHERE agent_id IN (SELECT id FROM agents WHERE api_key_id = ?)",
            (key_id,),
        )
        db.execute("UPDATE agents SET status = 'offline' WHERE api_key_id = ?", (key_id,))
    return True


def create_agent_session(
    api_key: str,
    *,
    device_id: str,
    device_name: str,
    platform: str,
    agent_version: str,
    capabilities: dict[str, Any],
    ttl_seconds: int = 3600,
) -> dict[str, Any] | None:
    now = utc_now()
    with connect() as db:
        key_row = db.execute(
            "SELECT id FROM agent_api_keys WHERE key_hash = ? AND revoked_at IS NULL",
            (_hash_secret(api_key),),
        ).fetchone()
        if not key_row:
            return None
        existing = db.execute("SELECT id FROM agents WHERE device_id = ?", (device_id,)).fetchone()
        agent_id = existing["id"] if existing else f"agent_{secrets.token_hex(8)}"
        db.execute(
            """
            INSERT INTO agents(id,api_key_id,device_id,device_name,platform,agent_version,capabilities_json,status,created_at,last_seen_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(device_id) DO UPDATE SET
              api_key_id=excluded.api_key_id, device_name=excluded.device_name,
              platform=excluded.platform, agent_version=excluded.agent_version,
              capabilities_json=excluded.capabilities_json, status='online', last_seen_at=excluded.last_seen_at
            """,
            (agent_id, key_row["id"], device_id, device_name, platform, agent_version, json.dumps(capabilities), "online", now, now),
        )
        access_token = f"qao_session_{secrets.token_urlsafe(36)}"
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat(timespec="seconds")
        db.execute(
            "INSERT INTO agent_sessions(token_hash,agent_id,created_at,expires_at) VALUES(?,?,?,?)",
            (_hash_secret(access_token), agent_id, now, expires_at),
        )
    return {
        "access_token": access_token,
        "expires_in": ttl_seconds,
        "agent": {
            "id": agent_id,
            "device_id": device_id,
            "device_name": device_name,
            "platform": platform,
            "status": "online",
        },
    }


def agent_for_access_token(access_token: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            """
            SELECT a.* , s.expires_at
            FROM agent_sessions s JOIN agents a ON a.id = s.agent_id
            WHERE s.token_hash = ?
            """,
            (_hash_secret(access_token),),
        ).fetchone()
    if not row or datetime.fromisoformat(row["expires_at"]) <= datetime.now(timezone.utc):
        return None
    payload = dict(row)
    payload["capabilities"] = json.loads(payload.pop("capabilities_json") or "{}")
    return payload


def heartbeat_agent(agent_id: str) -> dict[str, Any]:
    now = utc_now()
    with connect() as db:
        db.execute("UPDATE agents SET status = 'online', last_seen_at = ? WHERE id = ?", (now, agent_id))
    return {"status": "online", "last_seen_at": now}


def create_execution_run(request: Any, snapshot: dict[str, Any]) -> dict[str, Any]:
    run_id = f"run_{secrets.token_hex(8)}"
    run_plan_id = f"rp_{secrets.token_hex(8)}"
    now = utc_now()
    target_id = str(request.target.id) if request.target.id is not None else ",".join(map(str, request.target.ids))
    with connect() as db:
        db.execute(
            "INSERT INTO execution_runs(id,target_type,target_id,target_name,execution_target,application,environment,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (run_id, request.target.type, target_id, request.target.name, request.execution_target, request.application, request.environment, "queued", now, now),
        )
        db.execute(
            "INSERT INTO run_plans(id,run_id,status,assigned_agent_id,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (run_plan_id, run_id, "queued", request.assigned_agent_id, json.dumps(snapshot, ensure_ascii=False), now, now),
        )
        db.execute(
            "INSERT INTO run_plan_events(run_plan_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
            (run_plan_id, "created", json.dumps({"target": request.target.model_dump(mode="json")}), now),
        )
    return get_run_plan(run_plan_id) or {}


def _run_plan_payload(row: sqlite3.Row) -> dict[str, Any]:
    payload = dict(row)
    payload["snapshot"] = json.loads(payload.pop("snapshot_json"))
    payload["logs"] = json.loads(payload.pop("logs_json") or "[]")
    return payload


def get_run_plan(run_plan_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM run_plans WHERE id = ?", (run_plan_id,)).fetchone()
    return _run_plan_payload(row) if row else None


def list_run_plans(limit: int = 50) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM run_plans ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [_run_plan_payload(row) for row in rows]


def claim_run_plan(agent_id: str, lease_seconds: int) -> dict[str, Any] | None:
    now = utc_now()
    lease_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)).isoformat(timespec="seconds")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """
            SELECT rp.id FROM run_plans rp
            JOIN execution_runs er ON er.id = rp.run_id
            WHERE rp.status = 'queued' AND er.execution_target = 'local_agent'
              AND (rp.assigned_agent_id IS NULL OR rp.assigned_agent_id = ?)
            ORDER BY rp.created_at LIMIT 1
            """,
            (agent_id,),
        ).fetchone()
        if not row:
            return None
        db.execute(
            "UPDATE run_plans SET status='assigned', assigned_agent_id=?, lease_expires_at=?, updated_at=? WHERE id=? AND status='queued'",
            (agent_id, lease_expires_at, now, row["id"]),
        )
        db.execute("UPDATE execution_runs SET status='assigned', updated_at=? WHERE id=(SELECT run_id FROM run_plans WHERE id=?)", (now, row["id"]))
        db.execute(
            "INSERT INTO run_plan_events(run_plan_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
            (row["id"], "claimed", json.dumps({"agent_id": agent_id}), now),
        )
    return get_run_plan(row["id"])


def update_run_plan_status(agent_id: str, run_plan_id: str, status: str, result: str, error: str, logs: list[str]) -> dict[str, Any] | None:
    now = utc_now()
    with connect() as db:
        existing = db.execute("SELECT run_id, assigned_agent_id FROM run_plans WHERE id = ?", (run_plan_id,)).fetchone()
        if not existing or existing["assigned_agent_id"] != agent_id:
            return None
        db.execute(
            "UPDATE run_plans SET status=?, result=?, error=?, logs_json=?, updated_at=? WHERE id=?",
            (status, result, error, json.dumps(logs, ensure_ascii=False), now, run_plan_id),
        )
        db.execute("UPDATE execution_runs SET status=?, updated_at=? WHERE id=?", (status, now, existing["run_id"]))
        db.execute(
            "INSERT INTO run_plan_events(run_plan_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
            (run_plan_id, status, json.dumps({"result": result, "error": error, "log_count": len(logs)}, ensure_ascii=False), now),
        )
    return get_run_plan(run_plan_id)
