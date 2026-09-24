"""Data access functions for the FinAlly database. See planning/DB_INTERFACE.md."""

from __future__ import annotations

import json
import math
import sqlite3
from typing import Any

from .connection import connect, new_id, now_iso
from .errors import (
    InsufficientCashError,
    InsufficientSharesError,
    InvalidTradeError,
)
from .schema import DEFAULT_PROFILE_ID

# Quantities below this are treated as zero (floating point dust after a sell).
_EPSILON = 1e-9


def _norm(ticker: str) -> str:
    return ticker.strip().upper()


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


# --- Cash -------------------------------------------------------------------


def get_cash() -> float:
    with connect() as conn:
        row = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", (DEFAULT_PROFILE_ID,)
        ).fetchone()
    return float(row["cash_balance"])


def set_cash(amount: float) -> None:
    with connect(write=True) as conn:
        conn.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?", (amount, DEFAULT_PROFILE_ID)
        )


# --- Positions --------------------------------------------------------------


def get_positions() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions ORDER BY ticker"
        ).fetchall()
    return [_row(r) for r in rows]


def get_position(ticker: str) -> dict | None:
    with connect() as conn:
        return _get_position(conn, _norm(ticker))


def _get_position(conn: sqlite3.Connection, ticker: str) -> dict | None:
    row = conn.execute(
        "SELECT ticker, quantity, avg_cost, updated_at FROM positions WHERE ticker = ?", (ticker,)
    ).fetchone()
    return _row(row) if row else None


def _upsert_position(conn: sqlite3.Connection, ticker: str, quantity: float, avg_cost: float):
    if quantity <= _EPSILON:
        conn.execute("DELETE FROM positions WHERE ticker = ?", (ticker,))
        return
    conn.execute(
        "INSERT INTO positions (id, ticker, quantity, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(ticker) DO UPDATE SET quantity = excluded.quantity, "
        "avg_cost = excluded.avg_cost, updated_at = excluded.updated_at",
        (new_id(), ticker, quantity, avg_cost, now_iso()),
    )


def upsert_position(ticker: str, quantity: float, avg_cost: float) -> None:
    """Set a position's quantity and average cost. quantity <= 0 deletes it."""
    with connect(write=True) as conn:
        _upsert_position(conn, _norm(ticker), quantity, avg_cost)


def delete_position(ticker: str) -> bool:
    with connect(write=True) as conn:
        cur = conn.execute("DELETE FROM positions WHERE ticker = ?", (_norm(ticker),))
        return cur.rowcount > 0


# --- Trades -----------------------------------------------------------------


def _insert_trade(
    conn: sqlite3.Connection, ticker: str, side: str, quantity: float, price: float
) -> dict:
    trade = {
        "id": new_id(),
        "ticker": ticker,
        "side": side,
        "quantity": quantity,
        "price": price,
        "executed_at": now_iso(),
    }
    conn.execute(
        "INSERT INTO trades (id, ticker, side, quantity, price, executed_at) "
        "VALUES (:id, :ticker, :side, :quantity, :price, :executed_at)",
        trade,
    )
    return trade


def _validate_trade(ticker: str, side: str, quantity: float, price: float) -> None:
    if not ticker:
        raise InvalidTradeError("Ticker is required")
    if side not in ("buy", "sell"):
        raise InvalidTradeError(f"Invalid side '{side}': must be 'buy' or 'sell'")
    if not isinstance(quantity, (int, float)) or not math.isfinite(quantity) or quantity <= 0:
        raise InvalidTradeError("Quantity must be a positive number")
    if not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
        raise InvalidTradeError("Price must be a positive number")


def apply_trade(ticker: str, side: str, quantity: float, price: float) -> dict:
    """Atomically execute a trade: update cash, position and the trades log together."""
    ticker = _norm(ticker)
    side = side.strip().lower() if isinstance(side, str) else side
    _validate_trade(ticker, side, quantity, price)

    with connect(write=True) as conn:
        cash = float(
            conn.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", (DEFAULT_PROFILE_ID,)
            ).fetchone()["cash_balance"]
        )
        position = _get_position(conn, ticker)
        held = position["quantity"] if position else 0.0

        if side == "buy":
            cost = quantity * price
            if cost > cash + _EPSILON:
                raise InsufficientCashError(
                    f"Insufficient cash: need ${cost:,.2f} but only ${cash:,.2f} available"
                )
            new_cash = max(cash - cost, 0.0)
            new_qty = held + quantity
            old_cost = position["avg_cost"] * held if position else 0.0
            new_avg = (old_cost + cost) / new_qty
        else:
            if quantity > held + _EPSILON:
                raise InsufficientSharesError(
                    f"Insufficient shares: trying to sell {quantity:g} {ticker} "
                    f"but only {held:g} held"
                )
            new_cash = cash + quantity * price
            new_qty = held - quantity
            new_avg = position["avg_cost"] if position else 0.0

        conn.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (new_cash, DEFAULT_PROFILE_ID),
        )
        _upsert_position(conn, ticker, new_qty, new_avg)
        trade = _insert_trade(conn, ticker, side, quantity, price)

    trade["cash_balance"] = new_cash
    return trade


def record_trade(ticker: str, side: str, quantity: float, price: float) -> dict:
    """Append to the trade log only (no cash or position change)."""
    ticker = _norm(ticker)
    _validate_trade(ticker, side, quantity, price)
    with connect(write=True) as conn:
        return _insert_trade(conn, ticker, side, quantity, price)


def list_trades(limit: int | None = None) -> list[dict]:
    """Trade history, newest first."""
    sql = "SELECT id, ticker, side, quantity, price, executed_at FROM trades ORDER BY rowid DESC"
    params: tuple = ()
    if limit is not None:
        sql += " LIMIT ?"
        params = (limit,)
    with connect() as conn:
        return [_row(r) for r in conn.execute(sql, params).fetchall()]


# --- Watchlist --------------------------------------------------------------


def list_watchlist() -> list[str]:
    with connect() as conn:
        rows = conn.execute("SELECT ticker FROM watchlist ORDER BY rowid").fetchall()
    return [r["ticker"] for r in rows]


def add_watchlist(ticker: str) -> bool:
    ticker = _norm(ticker)
    if not ticker:
        raise ValueError("Ticker is required")
    with connect(write=True) as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO watchlist (id, ticker, added_at) VALUES (?, ?, ?)",
            (new_id(), ticker, now_iso()),
        )
        return cur.rowcount > 0


def remove_watchlist(ticker: str) -> bool:
    with connect(write=True) as conn:
        cur = conn.execute("DELETE FROM watchlist WHERE ticker = ?", (_norm(ticker),))
        return cur.rowcount > 0


# --- Portfolio snapshots ----------------------------------------------------


def record_snapshot(total_value: float) -> dict:
    snap = {"id": new_id(), "total_value": total_value, "recorded_at": now_iso()}
    with connect(write=True) as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, total_value, recorded_at) "
            "VALUES (:id, :total_value, :recorded_at)",
            snap,
        )
    return {"total_value": snap["total_value"], "recorded_at": snap["recorded_at"]}


def list_snapshots(limit: int | None = None) -> list[dict]:
    """Snapshots oldest first; with ``limit``, the most recent N (still oldest first)."""
    sql = "SELECT total_value, recorded_at FROM portfolio_snapshots ORDER BY rowid DESC"
    params: tuple = ()
    if limit is not None:
        sql += " LIMIT ?"
        params = (limit,)
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row(r) for r in reversed(rows)]


# --- Chat -------------------------------------------------------------------


def _chat_row(row: sqlite3.Row) -> dict:
    msg = _row(row)
    msg["actions"] = json.loads(msg["actions"]) if msg["actions"] is not None else None
    return msg


def add_chat_message(role: str, content: str, actions: dict | None = None) -> dict:
    if role not in ("user", "assistant"):
        raise ValueError(f"Invalid role '{role}': must be 'user' or 'assistant'")
    msg = {
        "id": new_id(),
        "role": role,
        "content": content,
        "actions": actions,
        "created_at": now_iso(),
    }
    with connect(write=True) as conn:
        conn.execute(
            "INSERT INTO chat_messages (id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                msg["id"],
                role,
                content,
                json.dumps(actions) if actions is not None else None,
                msg["created_at"],
            ),
        )
    return msg


def list_chat_messages(limit: int = 20) -> list[dict]:
    """The most recent ``limit`` messages, oldest first."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, role, content, actions, created_at FROM chat_messages "
            "ORDER BY rowid DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_chat_row(r) for r in reversed(rows)]
