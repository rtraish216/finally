"""Request/response models matching planning/API.md."""

from __future__ import annotations

from pydantic import BaseModel


class TradeRequest(BaseModel):
    ticker: str
    quantity: float
    side: str


class TradeResponse(BaseModel):
    ticker: str
    side: str
    quantity: float
    price: float
    executed_at: str
    cash_balance: float


class Position(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float


class PortfolioResponse(BaseModel):
    cash_balance: float
    total_value: float
    unrealized_pnl: float
    positions: list[Position]


class Snapshot(BaseModel):
    total_value: float
    recorded_at: str


class HistoryResponse(BaseModel):
    snapshots: list[Snapshot]


class WatchlistItem(BaseModel):
    ticker: str
    price: float | None
    previous_price: float | None
    session_start_price: float | None


class WatchlistResponse(BaseModel):
    watchlist: list[WatchlistItem]


class TickerRequest(BaseModel):
    ticker: str


class TickerResponse(BaseModel):
    ticker: str


class ChatRequest(BaseModel):
    message: str


class ChatTrade(BaseModel):
    ticker: str
    side: str
    quantity: float
    price: float | None = None
    status: str
    error: str | None = None


class ChatWatchlistChange(BaseModel):
    ticker: str
    action: str
    status: str
    error: str | None = None


class ChatResponse(BaseModel):
    message: str
    trades: list[ChatTrade] = []
    watchlist_changes: list[ChatWatchlistChange] = []


class ChatHistoryMessage(BaseModel):
    role: str
    content: str
    actions: dict | None
    created_at: str


class ChatHistoryResponse(BaseModel):
    messages: list[ChatHistoryMessage]
