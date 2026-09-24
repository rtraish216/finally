"""Service layer: portfolio and watchlist operations shared by REST routes and the LLM."""

from .errors import (
    InsufficientCashError,
    InsufficientSharesError,
    InvalidTickerError,
    InvalidTradeError,
    PriceUnavailableError,
    ServiceError,
    TradeError,
    UnknownTickerError,
)
from .portfolio import (
    execute_trade,
    get_history,
    get_portfolio,
    get_portfolio_context,
    record_snapshot,
)
from .watchlist import add_to_watchlist, get_watchlist, remove_from_watchlist

__all__ = [
    "InsufficientCashError",
    "InsufficientSharesError",
    "InvalidTickerError",
    "InvalidTradeError",
    "PriceUnavailableError",
    "ServiceError",
    "TradeError",
    "UnknownTickerError",
    "add_to_watchlist",
    "execute_trade",
    "get_history",
    "get_portfolio",
    "get_portfolio_context",
    "get_watchlist",
    "record_snapshot",
    "remove_from_watchlist",
]
