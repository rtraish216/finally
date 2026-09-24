"""Fixtures for database tests: each test gets its own SQLite file."""

import pytest


@pytest.fixture(autouse=True)
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "finally.db"
    monkeypatch.setenv("FINALLY_DB_PATH", str(path))
    return path
