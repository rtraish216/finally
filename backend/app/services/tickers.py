"""Ticker validation: format check plus the set of tickers the simulator supports."""

from __future__ import annotations

import re

from app.market.seed_prices import SEED_PRICES

from .errors import InvalidTickerError, UnknownTickerError

_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")

# Well-known tickers beyond the default watchlist. The simulator can price any symbol,
# so this catalogue is what defines "supported" (anything else is a 404).
EXTRA_TICKERS: frozenset[str] = frozenset(
    {
        "PYPL", "AMD", "INTC", "DIS", "BA", "KO", "PEP", "WMT", "COST", "ORCL", "CRM",
        "ADBE", "UBER", "SHOP", "SPOT", "COIN", "PLTR", "SNAP", "BAC", "GS", "MA", "XOM",
        "CVX", "JNJ", "PFE", "UNH", "HD", "NKE", "SBUX", "T", "VZ", "CSCO", "IBM", "QCOM",
        "MU", "AVGO", "TXN", "ABNB", "SQ", "ROKU",
    }
)  # fmt: skip

SUPPORTED_TICKERS: frozenset[str] = frozenset(SEED_PRICES) | EXTRA_TICKERS


def normalize_ticker(ticker: str) -> str:
    """Uppercase/strip a ticker and reject malformed input (InvalidTickerError)."""
    if not isinstance(ticker, str):
        raise InvalidTickerError("Ticker must be a string")
    cleaned = ticker.strip().upper()
    if not _TICKER_RE.match(cleaned):
        raise InvalidTickerError(f"Invalid ticker: {ticker!r}")
    return cleaned


def validate_ticker(ticker: str) -> str:
    """Normalize and require that the market source supports the ticker."""
    cleaned = normalize_ticker(ticker)
    if cleaned not in SUPPORTED_TICKERS:
        raise UnknownTickerError(f"Unknown ticker: {cleaned}")
    return cleaned
