# Massive API Reference (formerly Polygon.io)

Reference documentation for the Massive REST API and its official Python client, as verified against the `massive-com/client-python` source (GitHub) and `massive.com/pricing`. This supersedes `planning/archive/MASSIVE_API.md`, which contains several inaccurate field names — see "Corrections vs. the archived doc" at the end.

## Overview

- **Base URL**: `https://api.massive.com` (legacy `https://api.polygon.io` still works)
- **Python package**: `massive` on PyPI, current major version 2.x (e.g. `2.8.0`)
- **Install**: `pip install massive` / `uv add massive`
- **Auth**: API key, either the `MASSIVE_API_KEY` env var or passed to `RESTClient(...)`
- **Auth header**: the client handles `Authorization: Bearer <API_KEY>` automatically

## Client Initialization

```python
from massive import RESTClient

client = RESTClient()                 # reads MASSIVE_API_KEY from the environment
client = RESTClient("your_key_here")  # or pass the key explicitly (first positional arg)
```

## Pricing Tiers & Rate Limits

**This is the most important thing to get right for FinAlly's design** — the free tier is *not* real-time.

| Tier | Price | API Rate Limit | Data Freshness | History |
|---|---|---|---|---|
| Stocks Basic | Free | 5 calls/min | **End of day only** | 2 years |
| Stocks Starter | $29/mo | Unlimited | 15-minute delayed | 5 years |
| Stocks Developer | $79/mo | Unlimited | 15-minute delayed | 10 years |
| Stocks Advanced | $199/mo | Unlimited | **Real-time** | 20+ years |

Source: [massive.com/pricing](https://massive.com/pricing) (fetched live during this research; confirm before relying on exact numbers, as pricing pages change).

Implications for a project like FinAlly:
- A free (`Basic`) `MASSIVE_API_KEY` will **not** produce a live-updating ticker experience — expect end-of-day prices only, and only 5 requests/minute.
- The Snapshot service (below) — which is what a live poller needs — is described by Massive's own plan comparison as being added starting at the **Starter** tier. A Basic-tier key may receive a `403`/plan-restriction error when calling `get_snapshot_all`.
- Genuinely real-time last-trade prices require the **Advanced** ($199/mo) tier. Starter/Developer are 15-minute delayed, which is still fine for a "streaming-looking" demo but is not true real-time.
- Any integration should treat these limits as configuration, not assumptions — code defensively around 403/429 (see Error Handling below) rather than assuming a given key unlocks a given capability.

## Endpoints Used in FinAlly

### 1. Snapshot — All Tickers (primary polling endpoint)

Current data for multiple tickers in **one API call** — the endpoint a live poller should use.

**REST**: `GET /v2/snapshot/locale/{locale}/markets/{market_type}/tickers?tickers=AAPL,GOOGL,MSFT`

**Python client** (verified from `massive/rest/snapshot.py`):
```python
from massive import RESTClient

client = RESTClient()

snapshots = client.get_snapshot_all(
    market_type="stocks",                       # string is accepted; SnapshotMarketType enum also works
    tickers=["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"],
)

for snap in snapshots:
    print(snap.ticker, snap.last_trade.price if snap.last_trade else None)
```

`get_snapshot_all(market_type, tickers=None, params=None, raw=False, include_otc=False, options=None)` — `market_type` is required; `tickers` accepts a `list[str]` (joined into a comma-separated query param internally) or a raw comma-separated string.

### 2. Snapshot — Single Ticker

Same response shape as above, for one ticker (e.g. the detail view when a user clicks a ticker).

```python
snapshot = client.get_snapshot_ticker(
    market_type="stocks",
    ticker="AAPL",
)
print(snapshot.last_trade.price if snapshot.last_trade else None)
```

> **Note**: Massive's docs mark the per-market-type `/v2/snapshot/...` endpoints (what `get_snapshot_all`/`get_snapshot_ticker` call) as legacy, in favor of a newer "universal snapshot" endpoint. They remain fully supported in the current client version and are what this project uses; revisit if Massive removes them in a future major client version.

### 3. Grouped Daily — All Tickers, One Date (best EOD-for-many-tickers endpoint)

Returns end-of-day OHLCV for **every ticker on the exchange in a single call** for a given date. This is the right endpoint for "end of day prices for multiple tickers" rather than looping `get_previous_close_agg` per ticker.

**REST**: `GET /v2/aggs/grouped/locale/{locale}/market/{market_type}/{date}`

```python
bars = client.get_grouped_daily_aggs(
    date="2026-09-19",
    adjusted=True,
    locale="us",
    market_type="stocks",
)
by_ticker = {b.ticker: b for b in bars}
print(by_ticker["AAPL"].close)
```

Filter the returned list down to the watchlist tickers client-side, or accept the whole set and cache it if you want quick lookups for arbitrary tickers.

### 4. Previous Close — Single Ticker

Previous trading day's OHLC for one ticker. Useful for seeding a "previous close" baseline for a single symbol without pulling the whole market.

**REST**: `GET /v2/aggs/ticker/{ticker}/prev`

```python
prev = client.get_previous_close_agg(ticker="AAPL", adjusted=True)
for bar in prev:
    print(bar.open, bar.high, bar.low, bar.close, bar.volume)
```

### 5. Aggregates (Historical Bars)

Historical OHLCV over a date range — not needed for live polling, but the building block for any future historical-chart feature.

**REST**: `GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}`

```python
# get_aggs: single non-paginated call
aggs = client.get_aggs("AAPL", 1, "day", "2026-08-01", "2026-09-19")

# list_aggs: iterator, paginates automatically for large ranges
for bar in client.list_aggs(
    ticker="AAPL", multiplier=1, timespan="minute",
    from_="2026-09-01", to="2026-09-19", limit=50000,
):
    print(bar.timestamp, bar.close)
```

### 6. Last Trade / Last Quote — Single Ticker

Individual endpoints for just the most recent trade or NBBO quote, when a full snapshot is more than you need.

```python
trade = client.get_last_trade(ticker="AAPL")
print(trade.price, trade.size)

quote = client.get_last_quote(ticker="AAPL")   # GET /v2/last/nbbo/{ticker}
print(quote.bid_price, quote.ask_price)
```

## Response Field Reference (verified from client source)

### `TickerSnapshot` (returned by `get_snapshot_all` / `get_snapshot_ticker`)

```python
@modelclass
class TickerSnapshot:
    day: Optional[Agg]                    # today's OHLCV so far, JSON key "day"
    prev_day: Optional[Agg]               # previous session's OHLCV, JSON key "prevDay"
    last_trade: Optional[LastTrade]       # JSON key "lastTrade"
    last_quote: Optional[LastQuote]       # JSON key "lastQuote" — only if plan includes quotes
    min: Optional[MinuteSnapshot]         # latest minute bar, JSON key "min"
    ticker: Optional[str]
    todays_change: Optional[float]        # JSON key "todaysChange"
    todays_change_percent: Optional[float]  # JSON key "todaysChangePerc"
    updated: Optional[int]                # JSON key "updated"
    fair_market_value: Optional[float]    # JSON key "fmv"
```

**There is no `previous_close` or `change_percent` field nested under `day`.** Use `snap.prev_day.close` for previous close and `snap.todays_change_percent` for day-change percent — both are top-level fields on `TickerSnapshot`, not nested under `day`.

### `Agg` (used for both `day` and `prev_day`, and for aggregate bars)

| Field | JSON key |
|---|---|
| `open` | `"o"` |
| `high` | `"h"` |
| `low` | `"l"` |
| `close` | `"c"` |
| `volume` | `"v"` |
| `vwap` | `"vw"` |
| `timestamp` | `"t"` (Unix ms) |
| `transactions` | `"n"` |
| `otc` | `"otc"` |

### `LastTrade`

| Field | JSON key |
|---|---|
| `price` | `"p"` |
| `size` | `"s"` |
| `exchange` | `"x"` |
| `sip_timestamp` | `"t"` (Unix **nanoseconds**) |
| `participant_timestamp` | `"y"` |
| `trf_timestamp` | `"f"` |
| `conditions` | `"c"` |
| `id` | `"i"` |
| `sequence_number` | `"q"` |
| `tape` | `"z"` |

**There is no `LastTrade.timestamp` field.** The trade timestamp field is `sip_timestamp`, and it is in **nanoseconds**, not milliseconds — divide by `1_000_000_000` to get Unix seconds (not `1000` as milliseconds would require).

## Error Handling

The client raises exceptions for HTTP errors:
- **401** — invalid API key
- **403** — plan doesn't include the requested endpoint (e.g. a Basic-tier key calling Snapshot)
- **429** — rate limit exceeded (Basic tier: 5 req/min)
- **5xx** — server errors; the client retries a small number of times by default

FinAlly's poller should catch these per-cycle, log, and keep retrying on the next interval rather than crashing the background task — see `MARKET_INTERFACE.md`.

## Corrections vs. the archived doc

`planning/archive/MASSIVE_API.md` (written before this research pass) had a plausible-looking but incorrect response shape. If updating code that was written against it, check for these bugs:

1. `snap.day.previous_close` does not exist → use `snap.prev_day.close`
2. `snap.day.change_percent` does not exist → use `snap.todays_change_percent`
3. `snap.last_trade.timestamp` does not exist → use `snap.last_trade.sip_timestamp`, and it's **nanoseconds**, not milliseconds
4. The free tier is described in the archive as usable for live polling; it is actually EOD-only, and Snapshot may not be available on it at all
5. The archive doesn't mention `get_grouped_daily_aggs`, which is the correct endpoint for "EOD prices for multiple tickers" rather than looping single-ticker calls
