# FinAlly API Contract

Shared contract between backend and frontend. All endpoints are same-origin under `/api`. JSON everywhere except the SSE stream. Tickers are uppercase strings. Prices and money are plain numbers (USD).

## Errors

Any failure returns an HTTP status with `{"detail": "human-readable message"}`.
- `400` invalid request (bad quantity, insufficient cash/shares, malformed ticker)
- `404` unknown ticker (not supported by the market data source)

## `GET /api/stream/prices` (SSE)

One event roughly every 500ms containing **all tracked tickers** (watchlist plus open positions), keyed by ticker:

```
data: {"AAPL": {"ticker": "AAPL", "price": 190.52, "previous_price": 190.50, "session_start_price": 189.90, "timestamp": 1758400000.1, "change": 0.02, "change_percent": 0.0105, "direction": "up"}, "GOOGL": {...}}
```

- `direction`: `"up"`, `"down"` or `"flat"` (vs. previous tick).
- Daily change % = `(price - session_start_price) / session_start_price * 100`, computed by the client.
- **Code change needed:** the existing `PriceUpdate` in `backend/app/market/models.py` has no `session_start_price` yet; add it to the model and cache.

## Portfolio

### `GET /api/portfolio`
```json
{
  "cash_balance": 8100.0,
  "total_value": 10120.5,
  "unrealized_pnl": 120.5,
  "positions": [
    {"ticker": "AAPL", "quantity": 10, "avg_cost": 190.0, "current_price": 192.05,
     "market_value": 1920.5, "unrealized_pnl": 20.5, "unrealized_pnl_percent": 1.08}
  ]
}
```

### `POST /api/portfolio/trade`
Request: `{"ticker": "AAPL", "quantity": 10, "side": "buy"}` (`side` is `"buy"` or `"sell"`; `quantity` > 0, fractional allowed).
Fills instantly at the latest cached price. Response `200`:
```json
{"ticker": "AAPL", "side": "buy", "quantity": 10, "price": 190.5, "executed_at": "2026-09-21T10:00:00Z",
 "cash_balance": 8095.0}
```
Buy adds to the position at a weighted-average cost. Selling an entire position removes it. Errors: `400` for insufficient cash or shares.

### `GET /api/portfolio/history`
```json
{"snapshots": [{"total_value": 10000.0, "recorded_at": "2026-09-21T10:00:00Z"}]}
```
Oldest first.

## Watchlist

### `GET /api/watchlist`
```json
{"watchlist": [{"ticker": "AAPL", "price": 190.52, "previous_price": 190.5, "session_start_price": 189.9}]}
```

### `POST /api/watchlist`
Request `{"ticker": "PYPL"}`. Response `200`: `{"ticker": "PYPL"}`. `404` if the ticker is not supported; adding an existing ticker is a no-op success.

### `DELETE /api/watchlist/{ticker}`
Response `200`: `{"ticker": "PYPL"}`. A ticker with an open position keeps streaming prices after removal.

## Chat

### `POST /api/chat`
Request: `{"message": "Buy 5 shares of AAPL"}`. Response `200`:
```json
{
  "message": "Done - bought 5 AAPL. The NVDA sale failed.",
  "trades": [
    {"ticker": "AAPL", "side": "buy", "quantity": 5, "price": 190.5, "status": "executed"},
    {"ticker": "NVDA", "side": "sell", "quantity": 3, "status": "failed", "error": "Insufficient shares"}
  ],
  "watchlist_changes": [{"ticker": "PYPL", "action": "add", "status": "executed"}]
}
```
Each trade runs independently in order; every outcome is listed. `trades` and `watchlist_changes` are empty arrays when there are none. If the LLM output can't be parsed, return `message` with the raw text and empty action arrays.

### `GET /api/chat/history`
```json
{"messages": [{"role": "assistant", "content": "...", "actions": {"trades": [], "watchlist_changes": []}, "created_at": "2026-09-21T10:00:00Z"}]}
```
Oldest first. `actions` is `null` for user messages. The most recent 20 messages are also what the LLM sees as history.

## System

### `GET /api/health`
`{"status": "ok"}`
