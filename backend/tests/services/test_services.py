"""Service-layer tests, including the direct calls the LLM chat flow makes."""

from __future__ import annotations

import pytest

from app import services
from app.services import (
    InsufficientCashError,
    InsufficientSharesError,
    InvalidTickerError,
    InvalidTradeError,
    UnknownTickerError,
)


async def test_execute_trade_buy_and_sell(client):
    result = await services.execute_trade("aapl", "buy", 10)
    assert result["ticker"] == "AAPL"
    assert result["price"] == 100.0
    assert result["cash_balance"] == 9000.0
    result = await services.execute_trade("AAPL", "sell", 10)
    assert result["cash_balance"] == 10000.0


@pytest.mark.parametrize(
    ("ticker", "side", "quantity", "error"),
    [
        ("AAPL", "buy", 0, InvalidTradeError),
        ("AAPL", "buy", -1, InvalidTradeError),
        ("AAPL", "buy", float("nan"), InvalidTradeError),
        ("AAPL", "buy", True, InvalidTradeError),
        ("AAPL", "short", 1, InvalidTradeError),
        ("AAPL", "buy", 1000, InsufficientCashError),
        ("AAPL", "sell", 1, InsufficientSharesError),
        ("ZZZZ", "buy", 1, UnknownTickerError),
        ("", "buy", 1, InvalidTickerError),
    ],
)
async def test_execute_trade_errors_are_typed_value_errors(client, ticker, side, quantity, error):
    with pytest.raises(error) as excinfo:
        await services.execute_trade(ticker, side, quantity)
    assert isinstance(excinfo.value, ValueError)
    assert str(excinfo.value)


async def test_each_failure_is_independent(client):
    """The chat flow runs trades in order; one failure must not affect the others."""
    outcomes = []
    for ticker, side, quantity in [("AAPL", "buy", 5), ("NVDA", "sell", 3), ("MSFT", "buy", 1)]:
        try:
            await services.execute_trade(ticker, side, quantity)
            outcomes.append("executed")
        except ValueError:
            outcomes.append("failed")
    assert outcomes == ["executed", "failed", "executed"]
    assert {p["ticker"] for p in services.get_portfolio()["positions"]} == {"AAPL", "MSFT"}


async def test_watchlist_add_remove(client, source):
    assert await services.add_to_watchlist("pypl") == {"ticker": "PYPL", "added": True}
    assert await services.add_to_watchlist("PYPL") == {"ticker": "PYPL", "added": False}
    assert "PYPL" in source.get_tickers()
    assert await services.remove_from_watchlist("PYPL") == {"ticker": "PYPL", "removed": True}
    assert await services.remove_from_watchlist("PYPL") == {"ticker": "PYPL", "removed": False}
    assert "PYPL" not in source.get_tickers()


async def test_watchlist_errors(client):
    with pytest.raises(UnknownTickerError):
        await services.add_to_watchlist("ZZZZ")
    with pytest.raises(InvalidTickerError):
        await services.add_to_watchlist("bad ticker")


async def test_portfolio_context(client, set_price):
    await services.execute_trade("AAPL", "buy", 10)
    set_price("AAPL", 110.0)
    set_price("GOOGL", 210.0)  # +5% vs session start of 200
    context = services.get_portfolio_context()
    assert context["cash_balance"] == 9000.0
    assert context["total_value"] == 10100.0
    assert context["unrealized_pnl"] == 100.0
    assert context["positions"][0]["ticker"] == "AAPL"
    watch = {w["ticker"]: w for w in context["watchlist"]}
    assert len(watch) == 10
    assert watch["GOOGL"]["price"] == 210.0
    assert watch["GOOGL"]["session_start_price"] == 200.0
    assert watch["GOOGL"]["change_percent"] == 5.0
