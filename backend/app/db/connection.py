"""SQLite connection handling and lazy, idempotent initialisation."""

from __future__ import annotations

import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Iterator

from .schema import DEFAULT_CASH, DEFAULT_PROFILE_ID, DEFAULT_TICKERS, SCHEMA

# backend/app/db/connection.py -> project root is three levels above this package
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_initialized: set[str] = set()
_init_lock = Lock()


def db_path() -> Path:
    """Resolve the database file path (FINALLY_DB_PATH overrides the default)."""
    override = os.environ.get("FINALLY_DB_PATH")
    return Path(override) if override else _PROJECT_ROOT / "db" / "finally.db"


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string, e.g. 2026-09-21T10:00:00Z."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def new_id() -> str:
    return str(uuid.uuid4())


def _connect(path: Path) -> sqlite3.Connection:
    # isolation_level=None: we issue BEGIN/COMMIT ourselves for explicit transactions.
    conn = sqlite3.connect(path, timeout=5.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create tables and seed default data if needed. Safe to call repeatedly."""
    path = db_path()
    key = str(path)
    if key in _initialized and path.exists():
        return
    with _init_lock:
        if key in _initialized and path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = _connect(path)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            conn.execute("BEGIN IMMEDIATE")
            try:
                # The profile row is the "already seeded" marker so tickers the user
                # removed from the watchlist are never re-added.
                if conn.execute("SELECT 1 FROM users_profile LIMIT 1").fetchone() is None:
                    ts = now_iso()
                    conn.execute(
                        "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
                        (DEFAULT_PROFILE_ID, DEFAULT_CASH, ts),
                    )
                    conn.executemany(
                        "INSERT OR IGNORE INTO watchlist (id, ticker, added_at) VALUES (?, ?, ?)",
                        [(new_id(), t, ts) for t in DEFAULT_TICKERS],
                    )
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()
        _initialized.add(key)


@contextmanager
def connect(write: bool = False) -> Iterator[sqlite3.Connection]:
    """Yield a connection (lazily initialising the DB).

    With ``write=True`` the block runs in one ``BEGIN IMMEDIATE`` transaction that is
    committed on success and rolled back on any exception.
    """
    init_db()
    conn = _connect(db_path())
    try:
        if write:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")
        else:
            yield conn
    finally:
        conn.close()
