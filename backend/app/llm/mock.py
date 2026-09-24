"""Deterministic mock LLM for LLM_MOCK=true (no network).

Trigger phrases (case-insensitive) in the user's message:
- "buy [N] [shares of] TICKER" / "sell [N] [shares of] TICKER" -> trade (N defaults to 1)
- bare "buy" / "sell" with no ticker -> that side of 1 AAPL
- "add TICKER" / "remove TICKER" -> watchlist change
- anything else -> plain reply with no actions
Several phrases may be combined in one message; each produces its own action, in order.
"""

import json
import re

from .schemas import LLMResponse, TradeInstruction, WatchlistChange

DEFAULT_TICKER = "AAPL"
_STOPWORDS = {"shares", "share", "of", "some", "a", "an", "the", "stock", "stocks", "and", "then"}

_TRADE_RE = re.compile(
    r"\b(buy|sell)\s+(?:(\d+(?:\.\d+)?)\s+)?(?:shares?\s+(?:of\s+)?)?([A-Za-z]{1,5})\b", re.I
)
_WATCHLIST_RE = re.compile(r"\b(add|remove)\s+([A-Za-z]{1,5})\b", re.I)


def build_mock_response(user_message: str) -> LLMResponse:
    trades: list[TradeInstruction] = []
    for side, qty, ticker in _TRADE_RE.findall(user_message):
        if ticker.lower() in _STOPWORDS:
            continue
        trades.append(
            TradeInstruction(ticker=ticker.upper(), side=side.lower(), quantity=float(qty or 1))
        )
    if not trades:
        bare = re.search(r"\b(buy|sell)\b", user_message, re.I)
        if bare:
            trades.append(
                TradeInstruction(ticker=DEFAULT_TICKER, side=bare.group(1).lower(), quantity=1)
            )

    changes = [
        WatchlistChange(ticker=ticker.upper(), action=action.lower())
        for action, ticker in _WATCHLIST_RE.findall(user_message)
        if ticker.lower() not in _STOPWORDS
    ]

    if trades or changes:
        message = "Mock FinAlly: executing your request."
    else:
        message = "Mock FinAlly: I'm your AI trading assistant. Ask me about your portfolio."
    return LLMResponse(message=message, trades=trades, watchlist_changes=changes)


async def mock_call_llm(messages: list[dict]) -> str:
    """Drop-in replacement for call_llm: returns the JSON a real model would."""
    user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    return json.dumps(build_mock_response(user_message).model_dump())
