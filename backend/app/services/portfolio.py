"""Portfolio valuation and trade execution."""

from __future__ import annotations

from app import db

from . import market, runtime
from .errors import InvalidTradeError, PriceUnavailableError
from .tickers import validate_ticker


def _current_price(ticker: str, fallback: float) -> float:
    price = runtime.get_cache().get_price(ticker)
    return price if price is not None else fallback


def get_portfolio() -> dict:
    """Cash, positions with P&L and total value, valued at the latest cached prices."""
    cash = db.get_cash()
    positions = []
    market_total = 0.0
    cost_total = 0.0
    for row in db.get_positions():
        qty, avg_cost = row["quantity"], row["avg_cost"]
        price = _current_price(row["ticker"], avg_cost)
        value = qty * price
        cost = qty * avg_cost
        market_total += value
        cost_total += cost
        positions.append(
            {
                "ticker": row["ticker"],
                "quantity": qty,
                "avg_cost": round(avg_cost, 4),
                "current_price": price,
                "market_value": round(value, 2),
                "unrealized_pnl": round(value - cost, 2),
                "unrealized_pnl_percent": round((value - cost) / cost * 100, 2) if cost else 0.0,
            }
        )
    return {
        "cash_balance": round(cash, 2),
        "total_value": round(cash + market_total, 2),
        "unrealized_pnl": round(market_total - cost_total, 2),
        "positions": positions,
    }


def get_portfolio_context() -> dict:
    """Portfolio plus the watchlist with live prices, for building the LLM prompt.

    Shape: the `get_portfolio()` dict plus
    `"watchlist": [{"ticker", "price", "previous_price", "session_start_price", "change_percent"}]`
    where `change_percent` is the % change since session start.
    """
    context = get_portfolio()
    cache = runtime.get_cache()
    watchlist = []
    for ticker in db.list_watchlist():
        update = cache.get(ticker)
        if update is None:
            watchlist.append({"ticker": ticker, "price": None, "previous_price": None,
                              "session_start_price": None, "change_percent": None})
            continue
        start = update.session_start_price
        watchlist.append(
            {
                "ticker": ticker,
                "price": update.price,
                "previous_price": update.previous_price,
                "session_start_price": start,
                "change_percent": round((update.price - start) / start * 100, 2) if start else 0.0,
            }
        )
    context["watchlist"] = watchlist
    return context


def record_snapshot() -> dict:
    """Record the current total portfolio value."""
    return db.record_snapshot(get_portfolio()["total_value"])


def get_history() -> list[dict]:
    """Portfolio value snapshots, oldest first."""
    return db.list_snapshots()


async def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Market order filled instantly at the latest cached price.

    Returns `{"ticker", "side", "quantity", "price", "executed_at", "cash_balance"}`.
    Raises `InvalidTickerError`/`UnknownTickerError`, `InvalidTradeError`,
    `InsufficientCashError`, `InsufficientSharesError` or `PriceUnavailableError`
    (all `ValueError` subclasses with human-readable messages).
    """
    ticker = validate_ticker(ticker)
    side = side.strip().lower() if isinstance(side, str) else side
    if side not in ("buy", "sell"):
        raise InvalidTradeError("Side must be 'buy' or 'sell'")
    if isinstance(quantity, bool) or not isinstance(quantity, (int, float)) or not quantity > 0:
        raise InvalidTradeError("Quantity must be a positive number")

    try:
        await market.ensure_tracked(ticker)
        price = runtime.get_cache().get_price(ticker)
        if price is None:
            raise PriceUnavailableError(f"No price available for {ticker} right now")
        result = db.apply_trade(ticker, side, quantity, price)
    finally:
        # Keeps the tracked set exact: drops an untracked ticker on failure or a full sell.
        await market.sync_ticker(ticker)

    record_snapshot()
    return {
        "ticker": result["ticker"],
        "side": result["side"],
        "quantity": result["quantity"],
        "price": result["price"],
        "executed_at": result["executed_at"],
        "cash_balance": result["cash_balance"],
    }
