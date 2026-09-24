"""Watchlist management."""

from __future__ import annotations

from app import db

from . import market, runtime
from .tickers import validate_ticker


def get_watchlist() -> list[dict]:
    """Watchlist tickers with latest prices (price fields are None if not yet available)."""
    cache = runtime.get_cache()
    items = []
    for ticker in db.list_watchlist():
        update = cache.get(ticker)
        items.append(
            {
                "ticker": ticker,
                "price": update.price if update else None,
                "previous_price": update.previous_price if update else None,
                "session_start_price": update.session_start_price if update else None,
            }
        )
    return items


async def add_to_watchlist(ticker: str) -> dict:
    """Add a ticker (no-op if present). Returns `{"ticker", "added": bool}`.

    Raises `InvalidTickerError` (malformed) or `UnknownTickerError` (unsupported).
    """
    ticker = validate_ticker(ticker)
    added = db.add_watchlist(ticker)
    await market.sync_ticker(ticker)
    return {"ticker": ticker, "added": added}


async def remove_from_watchlist(ticker: str) -> dict:
    """Remove a ticker (no-op if absent). Returns `{"ticker", "removed": bool}`.

    A ticker with an open position keeps streaming prices.
    """
    ticker = validate_ticker(ticker)
    removed = db.remove_watchlist(ticker)
    await market.sync_ticker(ticker)
    return {"ticker": ticker, "removed": removed}
