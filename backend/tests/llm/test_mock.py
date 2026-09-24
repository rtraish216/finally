"""Mock LLM trigger phrases (deterministic, no network)."""

import json

import pytest

from app.llm.mock import build_mock_response, mock_call_llm


def trades(msg):
    return [(t.ticker, t.side, t.quantity) for t in build_mock_response(msg).trades]


def test_plain_message_has_no_actions():
    r = build_mock_response("How is my portfolio doing?")
    assert r.message and r.trades == [] and r.watchlist_changes == []


@pytest.mark.parametrize(
    "msg,expected",
    [
        ("buy", [("AAPL", "buy", 1)]),
        ("Please BUY some", [("AAPL", "buy", 1)]),
        ("sell", [("AAPL", "sell", 1)]),
        ("buy MSFT", [("MSFT", "buy", 1)]),
        ("buy 5 shares of nvda", [("NVDA", "buy", 5)]),
        ("sell 9999 AAPL", [("AAPL", "sell", 9999)]),
        ("buy 0.5 TSLA", [("TSLA", "buy", 0.5)]),
        ("buy 1 AAPL and sell 9999 NVDA", [("AAPL", "buy", 1), ("NVDA", "sell", 9999)]),
    ],
)
def test_trade_triggers(msg, expected):
    assert trades(msg) == expected


def test_watchlist_triggers():
    r = build_mock_response("add PYPL")
    assert [(c.ticker, c.action) for c in r.watchlist_changes] == [("PYPL", "add")]
    r = build_mock_response("please remove nflx")
    assert [(c.ticker, c.action) for c in r.watchlist_changes] == [("NFLX", "remove")]


def test_combined_trade_and_watchlist():
    r = build_mock_response("buy AAPL and add PYPL")
    assert len(r.trades) == 1 and len(r.watchlist_changes) == 1


async def test_mock_call_returns_json_for_last_user_message():
    raw = await mock_call_llm(
        [{"role": "system", "content": "x"}, {"role": "user", "content": "sell 9999 AAPL"}]
    )
    data = json.loads(raw)
    assert data["trades"] == [{"ticker": "AAPL", "side": "sell", "quantity": 9999.0}]
