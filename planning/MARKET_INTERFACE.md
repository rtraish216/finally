# Market Data Interface Design

Unified Python interface for market data in FinAlly. Two implementations — the built-in GBM simulator and the Massive API — behind one abstract interface, selected automatically by whether `MASSIVE_API_KEY` is set. All downstream code (SSE streaming, price cache, portfolio valuation) is source-agnostic and only ever sees `PriceUpdate` objects from a shared `PriceCache`.

This design is based on verified findings in `MASSIVE_API.md`. In particular: **a free-tier Massive key does not provide real-time or even live-polled data** — it's end-of-day only, and the Snapshot endpoint this design polls may not be available below the Starter ($29/mo) tier at all. The interface is written to degrade gracefully rather than assume a working key always means live prices.

## Core Data Model

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class PriceUpdate:
    """A single price update for one ticker. The only type that leaves the market data layer."""
    ticker: str
    price: float
    previous_price: float
    timestamp: float          # Unix seconds

    @property
    def change(self) -> float:
        return self.price - self.previous_price

    @property
    def change_percent(self) -> float:
        return (self.change / self.previous_price * 100) if self.previous_price else 0.0

    @property
    def direction(self) -> str:
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"
```

## Abstract Interface

```python
from abc import ABC, abstractmethod

class MarketDataSource(ABC):
    """Abstract interface for market data providers."""

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing price updates for the given tickers."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop producing price updates and clean up."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Add a ticker to the active set."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Remove a ticker from the active set."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Return the current list of active tickers."""
```

Both implementations write to a shared `PriceCache` on their own schedule — the interface never returns prices directly to the caller.

## Price Cache

Thread-safe in-memory store that both data sources write to and the SSE streamer reads from. A monotonic `version` counter lets the SSE loop cheaply detect "did anything change since I last looked" without diffing.

```python
import time
from threading import Lock

class PriceCache:
    """Thread-safe cache of the latest price for each ticker."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self._version = 0

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceUpdate:
        with self._lock:
            ts = timestamp or time.time()
            prev = self._prices.get(ticker)
            previous_price = prev.price if prev else price

            update = PriceUpdate(
                ticker=ticker,
                price=round(price, 2),
                previous_price=round(previous_price, 2),
                timestamp=ts,
            )
            self._prices[ticker] = update
            self._version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        with self._lock:
            return self._prices.get(ticker)

    def get_all(self) -> dict[str, PriceUpdate]:
        with self._lock:
            return dict(self._prices)

    def remove(self, ticker: str) -> None:
        with self._lock:
            self._prices.pop(ticker, None)

    @property
    def version(self) -> int:
        return self._version
```

## Factory Function

Select the data source at startup based on environment. The factory only decides *which class to instantiate* — it does not validate the key against Massive (that happens lazily on the first poll, so a bad or under-tiered key surfaces as a logged error rather than a startup crash).

```python
import os

def create_market_data_source(price_cache: PriceCache) -> MarketDataSource:
    """Create the appropriate market data source based on environment.

    - MASSIVE_API_KEY set and non-empty -> MassiveDataSource (real market data)
    - Otherwise -> SimulatorDataSource (GBM simulation)

    Returns an unstarted source; caller must await source.start(tickers).
    """
    api_key = os.environ.get("MASSIVE_API_KEY", "").strip()

    if api_key:
        from .massive_client import MassiveDataSource
        return MassiveDataSource(api_key=api_key, price_cache=price_cache)
    else:
        from .simulator import SimulatorDataSource
        return SimulatorDataSource(price_cache=price_cache)
```

## Massive Implementation

Polls `get_snapshot_all` for the watched tickers on a timer and writes results into the shared cache. Field access matches the verified response shape in `MASSIVE_API.md` — notably `prev_day.close` (not `day.previous_close`) and `last_trade.sip_timestamp` in **nanoseconds** (not `.timestamp` in milliseconds, which doesn't exist on the model).

```python
import asyncio
import logging

from massive import RESTClient

logger = logging.getLogger(__name__)


class MassiveDataSource(MarketDataSource):
    """MarketDataSource backed by the Massive REST API.

    Polls GET /v2/snapshot/locale/us/markets/stocks/tickers for all watched
    tickers in a single API call.

    Poll interval is a *rate-limit* accommodation, not a freshness guarantee:
    even at the fastest allowed interval, a free/Basic-tier key returns
    end-of-day data and a Starter/Developer-tier key returns 15-minute-delayed
    data. Only an Advanced-tier key returns true real-time prices. See
    MASSIVE_API.md's pricing table.
    """

    def __init__(self, api_key: str, price_cache: PriceCache, poll_interval: float = 15.0):
        self._client = RESTClient(api_key=api_key)
        self._cache = price_cache
        self._interval = poll_interval
        self._tickers: list[str] = []
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._tickers = list(tickers)
        await self._poll_once()  # immediate first poll so the cache isn't empty
        self._task = asyncio.create_task(self._poll_loop(), name="massive-poller")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def add_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        if ticker not in self._tickers:
            self._tickers.append(ticker)

    async def remove_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        self._tickers = [t for t in self._tickers if t != ticker]
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    async def _poll_loop(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            await self._poll_once()

    async def _poll_once(self) -> None:
        if not self._tickers:
            return
        try:
            # RESTClient is synchronous; run it off the event loop.
            snapshots = await asyncio.to_thread(
                self._client.get_snapshot_all,
                market_type="stocks",
                tickers=self._tickers,
            )
        except Exception as e:
            # Covers 401 (bad key), 403 (plan doesn't include Snapshot —
            # e.g. a free-tier key), 429 (rate limit), and network errors.
            # Don't raise: log and let the next interval retry.
            logger.error("Massive poll failed: %s", e)
            return

        for snap in snapshots:
            if not snap.last_trade or snap.last_trade.price is None:
                continue
            price = snap.last_trade.price
            timestamp = (
                snap.last_trade.sip_timestamp / 1_000_000_000
                if snap.last_trade.sip_timestamp
                else None
            )
            self._cache.update(ticker=snap.ticker, price=price, timestamp=timestamp)
```

### Choosing a poll interval

| Tier | Rate limit | Recommended poll interval |
|---|---|---|
| Basic (free) | 5 req/min | 15s (and expect stale/EOD values regardless of interval) |
| Starter / Developer | Unlimited | 2–5s (still 15-min delayed underneath) |
| Advanced | Unlimited | 1–2s (true real-time) |

A poll interval faster than what the plan's data actually refreshes at just re-fetches the same value — it doesn't buy freshness, only wastes requests. For a course project where students are expected to use free-tier keys (if any), default to the 15s/Basic-tier-safe interval and document that the simulator is the realistic default; treat Massive as an opt-in upgrade path, matching the project's stated design (`PLAN.md` §6: "the market data interface leaves room to add [a real provider] later").

## Simulator Implementation

See `MARKET_SIMULATOR.md` for the full design. It implements the same `MarketDataSource` interface:

```python
class SimulatorDataSource(MarketDataSource):
    def __init__(self, price_cache: PriceCache, update_interval: float = 0.5):
        self._cache = price_cache
        self._interval = update_interval
        self._tickers: list[str] = []
        self._task: asyncio.Task | None = None
        self._sim: GBMSimulator | None = None

    async def start(self, tickers: list[str]) -> None:
        self._tickers = list(tickers)
        self._sim = GBMSimulator(tickers=self._tickers)
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self._tickers:
            self._tickers.append(ticker)
            self._sim.add_ticker(ticker)

    async def remove_ticker(self, ticker: str) -> None:
        self._tickers = [t for t in self._tickers if t != ticker]
        self._sim.remove_ticker(ticker)
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    async def _run_loop(self) -> None:
        while True:
            for ticker, price in self._sim.step().items():
                self._cache.update(ticker=ticker, price=price)
            await asyncio.sleep(self._interval)
```

## Integration with SSE

The SSE endpoint reads from the `PriceCache` and pushes to connected clients — see `planning/API.md` for the exact event payload contract.

```python
import json

async def price_stream(price_cache: PriceCache):
    while True:
        prices = price_cache.get_all()
        data = {
            ticker: {
                "ticker": p.ticker,
                "price": p.price,
                "previous_price": p.previous_price,
                "change": p.change,
                "direction": p.direction,
                "timestamp": p.timestamp,
            }
            for ticker, p in prices.items()
        }
        yield f"data: {json.dumps(data)}\n\n"
        await asyncio.sleep(0.5)
```

## File Structure

```
backend/
  app/
    market/
      __init__.py
      models.py             # PriceUpdate dataclass
      cache.py              # PriceCache
      interface.py           # MarketDataSource ABC
      factory.py             # create_market_data_source()
      massive_client.py      # MassiveDataSource
      simulator.py           # SimulatorDataSource + GBMSimulator
      seed_prices.py         # Default ticker seed prices
```

## Lifecycle

1. **App startup**: create `PriceCache`, call `create_market_data_source(price_cache)`, then `await source.start(initial_tickers)`
2. **Watchlist changes**: `source.add_ticker()` / `source.remove_ticker()`
3. **SSE streaming**: reads `PriceCache.get_all()` on a ~500ms cadence
4. **Trade execution**: reads current price via `PriceCache.get(ticker)`
5. **App shutdown**: `await source.stop()`

## Known follow-up: existing `massive_client.py`

The backend's current `massive_client.py` (written before this research pass) has the two field-name bugs called out in `MASSIVE_API.md`: it reads `snap.last_trade.timestamp` (doesn't exist — should be `sip_timestamp`, in nanoseconds not milliseconds) and doesn't use `prev_day.close`/`todays_change_percent` anywhere it needs previous-close or day-change data. It's currently dormant/untested against a live key per `PLAN.md`'s decisions log, so this hasn't caused a visible failure yet, but should be fixed before the Massive path is ever exercised for real.
