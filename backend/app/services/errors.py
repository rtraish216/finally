"""Typed domain errors raised by the service layer.

Trade validation errors come from the db layer (`TradeError` and subclasses) and are
re-exported here so callers only need `app.services`.
"""

from __future__ import annotations

from app.db import (
    InsufficientCashError,
    InsufficientSharesError,
    InvalidTradeError,
    TradeError,
)


class ServiceError(ValueError):
    """Base class for service-layer failures. `str(e)` is a human-readable message."""


class UnknownTickerError(ServiceError):
    """The ticker is not supported by the market data source (HTTP 404)."""


class InvalidTickerError(ServiceError):
    """The ticker is malformed (HTTP 400)."""


class PriceUnavailableError(ServiceError):
    """No price is currently available for the ticker (HTTP 400)."""


__all__ = [
    "InsufficientCashError",
    "InsufficientSharesError",
    "InvalidTickerError",
    "InvalidTradeError",
    "PriceUnavailableError",
    "ServiceError",
    "TradeError",
    "UnknownTickerError",
]
