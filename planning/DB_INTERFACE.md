# Database Interface

Package: `backend/app/db/`. Import everything from `app.db`:

```python
from app.db import (
    init_db, get_cash, set_cash,
    get_positions, get_position, upsert_position, delete_position,
    apply_trade, record_trade, list_trades,
    list_watchlist, add_watchlist, remove_watchlist,
    record_snapshot, list_snapshots,
    add_chat_message, list_chat_messages,
    TradeError, InsufficientCashError, InsufficientSharesError, InvalidTradeError,
)
```

## Design

- stdlib `sqlite3`, **synchronous**. Every call opens a short-lived connection (WAL mode, `busy_timeout=5000`, foreign keys on), so it is safe from request handlers, background tasks and threads at once. Calls are sub-millisecond; call them directly from `async def` handlers, or wrap in `asyncio.to_thread` if you prefer.
- DB path: `FINALLY_DB_PATH` env var if set (read on every call, so tests can monkeypatch it), otherwise `<project root>/db/finally.db`. Docker should set `FINALLY_DB_PATH=/app/db/finally.db`. The parent directory is created if missing.
- **Lazy init**: every public function calls `init_db()` first (cheap and idempotent after the first call per path), so nothing has to be called explicitly. `init_db()` is still exported so the app can call it in its startup/lifespan hook.
- Rows are returned as plain `dict`s (JSON-ready). Ids are UUID strings; timestamps are ISO-8601 UTC strings with microseconds like `2026-09-21T10:00:00.123456Z`.
- Tickers are normalised (`strip().upper()`) by every function taking a ticker.

## Functions

```python
def init_db() -> None
```
Create tables if missing and seed (only when the profile row / watchlist have never been seeded): profile `id="default"`, cash `10000.0`, watchlist AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX. Idempotent; never re-adds tickers the user removed.

### Cash
```python
def get_cash() -> float
def set_cash(amount: float) -> None
```

### Positions
```python
def get_positions() -> list[dict]      # [{"ticker","quantity","avg_cost","updated_at"}], ordered by ticker
def get_position(ticker: str) -> dict | None
def upsert_position(ticker: str, quantity: float, avg_cost: float) -> None   # quantity <= 0 deletes
def delete_position(ticker: str) -> bool
```
Prefer `apply_trade` for anything trade related; the position helpers are low-level.

### Trades
```python
def apply_trade(ticker: str, side: str, quantity: float, price: float) -> dict
```
**Atomic** (single `BEGIN IMMEDIATE` transaction): validates, updates cash, upserts/deletes the position (weighted-average cost on buys; full sell removes the row) and appends to `trades`. Returns
`{"id","ticker","side","quantity","price","executed_at","cash_balance"}` (`cash_balance` is the balance after the trade). On any error nothing is written.

Raises (all subclass `TradeError`, which subclasses `ValueError`; `str(e)` is a human-readable message suitable for the API `detail` / chat `error`):
- `InvalidTradeError` - side not `"buy"`/`"sell"`, quantity or price not > 0 / not finite
- `InsufficientCashError` - buy cost exceeds cash
- `InsufficientSharesError` - sell exceeds held quantity (or no position)

```python
def record_trade(ticker, side, quantity, price) -> dict   # log only, no cash/position change
def list_trades(limit: int | None = None) -> list[dict]   # newest first
```

### Watchlist
```python
def list_watchlist() -> list[str]            # tickers in the order added
def add_watchlist(ticker: str) -> bool       # True if added, False if already present (no-op)
def remove_watchlist(ticker: str) -> bool    # True if removed, False if not present
```

### Portfolio snapshots
```python
def record_snapshot(total_value: float) -> dict     # {"total_value","recorded_at"}
def list_snapshots(limit: int | None = None) -> list[dict]   # oldest first; with limit, the most recent N (still oldest first)
```

### Chat
```python
def add_chat_message(role: str, content: str, actions: dict | None = None) -> dict
def list_chat_messages(limit: int = 20) -> list[dict]   # most recent `limit`, oldest first
```
Message dict: `{"id","role","content","actions","created_at"}`. `role` is `"user"` or `"assistant"`; `actions` (e.g. `{"trades": [...], "watchlist_changes": [...]}`) is JSON-serialised on write, parsed back on read, `None` for user messages.
