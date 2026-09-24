"""Database layer for FinAlly (SQLite).

Public API (see planning/DB_INTERFACE.md):
    init_db                      - Lazy, idempotent schema creation and seeding
    get_cash / set_cash          - Cash balance
    get_positions / get_position / upsert_position / delete_position
    apply_trade                  - Atomic trade execution (cash + position + trade log)
    record_trade / list_trades   - Trade log
    list_watchlist / add_watchlist / remove_watchlist
    record_snapshot / list_snapshots
    add_chat_message / list_chat_messages
    TradeError, InsufficientCashError, InsufficientSharesError, InvalidTradeError
"""

from .connection import db_path, init_db
from .errors import (
    InsufficientCashError,
    InsufficientSharesError,
    InvalidTradeError,
    TradeError,
)
from .repository import (
    add_chat_message,
    add_watchlist,
    apply_trade,
    delete_position,
    get_cash,
    get_position,
    get_positions,
    list_chat_messages,
    list_snapshots,
    list_trades,
    list_watchlist,
    record_snapshot,
    record_trade,
    remove_watchlist,
    set_cash,
    upsert_position,
)

__all__ = [
    "db_path",
    "init_db",
    "get_cash",
    "set_cash",
    "get_positions",
    "get_position",
    "upsert_position",
    "delete_position",
    "apply_trade",
    "record_trade",
    "list_trades",
    "list_watchlist",
    "add_watchlist",
    "remove_watchlist",
    "record_snapshot",
    "list_snapshots",
    "add_chat_message",
    "list_chat_messages",
    "TradeError",
    "InsufficientCashError",
    "InsufficientSharesError",
    "InvalidTradeError",
]
