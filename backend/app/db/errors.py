"""Exceptions raised by the database layer."""

from __future__ import annotations


class TradeError(ValueError):
    """Base class for trade validation failures. ``str(e)`` is user-presentable."""


class InvalidTradeError(TradeError):
    """Bad side, quantity or price."""


class InsufficientCashError(TradeError):
    """Buy cost exceeds the available cash balance."""


class InsufficientSharesError(TradeError):
    """Sell quantity exceeds the shares held."""
