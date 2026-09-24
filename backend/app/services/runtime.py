"""Process-wide handles to the price cache and market data source.

`create_app()` configures the cache; the lifespan hook attaches the started source.
Services read these instead of taking them as arguments so the LLM layer can call
`execute_trade(...)` etc. directly.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.market import MarketDataSource, PriceCache


@dataclass
class Runtime:
    cache: PriceCache | None = None
    source: MarketDataSource | None = None


state = Runtime()


def configure(cache: PriceCache, source: MarketDataSource | None = None) -> None:
    state.cache = cache
    state.source = source


def get_cache() -> PriceCache:
    if state.cache is None:
        raise RuntimeError("Price cache is not configured")
    return state.cache
