"""Keeps the market data source's tracked set in sync with the DB.

Tracked set = watchlist + tickers with open positions.
"""

from __future__ import annotations

from app import db

from . import runtime


def required_tickers() -> set[str]:
    return set(db.list_watchlist()) | {p["ticker"] for p in db.get_positions()}


async def sync_ticker(ticker: str) -> None:
    """Start or stop tracking `ticker` depending on whether the DB still needs it."""
    source = runtime.state.source
    if source is None:
        return
    tracked = ticker in source.get_tickers()
    needed = ticker in required_tickers()
    if needed and not tracked:
        await source.add_ticker(ticker)
    elif not needed and tracked:
        await source.remove_ticker(ticker)


async def ensure_tracked(ticker: str) -> None:
    """Make sure a price exists for `ticker` (starts tracking it if necessary)."""
    source = runtime.state.source
    if source is not None and ticker not in source.get_tickers():
        await source.add_ticker(ticker)
