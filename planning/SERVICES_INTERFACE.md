# Services Interface

Package: `backend/app/services/`. Import everything from `app.services`. This is the layer both the REST routes and the LLM chat flow use, so chat trades get exactly the same validation as manual trades.

```python
from app.services import (
    execute_trade, add_to_watchlist, remove_from_watchlist,
    get_portfolio_context, get_portfolio, get_watchlist,
    UnknownTickerError, InvalidTickerError, InvalidTradeError,
    InsufficientCashError, InsufficientSharesError, PriceUnavailableError,
    ServiceError, TradeError,
)
```

All errors are `ValueError` subclasses; `str(e)` is a human-readable message, suitable as the `error` field of a failed chat action. Catch `ValueError` to handle every failure generically.

| Error | Meaning | HTTP |
|---|---|---|
| `InvalidTickerError` | malformed ticker | 400 |
| `UnknownTickerError` | ticker not supported by the market source | 404 |
| `InvalidTradeError` | bad side / quantity <= 0 | 400 |
| `InsufficientCashError` | buy costs more than cash | 400 |
| `InsufficientSharesError` | sell exceeds holding | 400 |
| `PriceUnavailableError` | no cached price yet | 400 |

## Functions

```python
async def execute_trade(ticker: str, side: str, quantity: float) -> dict
```
Market order at the latest cached price. Returns `{"ticker","side","quantity","price","executed_at","cash_balance"}`. Records a portfolio snapshot and keeps the market source's tracked set correct. Raises any error above.

```python
async def add_to_watchlist(ticker: str) -> dict     # {"ticker", "added": bool}   (added=False -> already present)
async def remove_from_watchlist(ticker: str) -> dict  # {"ticker", "removed": bool}
```
Raise `InvalidTickerError` / `UnknownTickerError`. A removed ticker with an open position keeps streaming.

```python
def get_portfolio_context() -> dict
```
Sync. `{"cash_balance", "total_value", "unrealized_pnl", "positions": [{"ticker","quantity","avg_cost","current_price","market_value","unrealized_pnl","unrealized_pnl_percent"}], "watchlist": [{"ticker","price","previous_price","session_start_price","change_percent"}]}`. `change_percent` is % since session start; watchlist price fields can be `None` briefly.

`get_portfolio()` is the same without `"watchlist"`; `get_watchlist()` returns the REST watchlist items.

## Supported tickers

"Supported" = the default 10 plus a catalogue of ~40 well-known symbols (`app/services/tickers.py`, e.g. PYPL, AMD, DIS). Anything else is `UnknownTickerError`.

## Chat entry point (owned by llm-engineer)

`POST /api/chat` calls:

```python
# backend/app/llm/__init__.py
async def handle_chat(message: str) -> dict
```
returning the response JSON from `planning/API.md` (`{"message", "trades": [...], "watchlist_changes": [...]}`). `handle_chat` is responsible for persisting the user message and assistant reply (with `actions`) via `app.db.add_chat_message`. It should never raise for LLM/parse problems (return a friendly `message` with empty action arrays); the route turns any escaped exception into a 500 `{"detail": ...}`. If `app.llm` is not importable the route returns a stub reply.
