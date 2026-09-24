"""Pydantic schemas for the LLM structured output."""

from pydantic import BaseModel, Field, field_validator


class TradeInstruction(BaseModel):
    """A trade the assistant wants to execute (side is validated at execution time)."""

    ticker: str
    side: str
    quantity: float

    @field_validator("ticker", "side", mode="before")
    @classmethod
    def _normalise(cls, value):
        return value.strip() if isinstance(value, str) else value


class WatchlistChange(BaseModel):
    """A watchlist modification (action is validated at execution time)."""

    ticker: str
    action: str

    @field_validator("ticker", "action", mode="before")
    @classmethod
    def _normalise(cls, value):
        return value.strip() if isinstance(value, str) else value


class LLMResponse(BaseModel):
    """Structured response the model is instructed to produce."""

    message: str
    trades: list[TradeInstruction] = Field(default_factory=list)
    watchlist_changes: list[WatchlistChange] = Field(default_factory=list)

    @field_validator("trades", "watchlist_changes", mode="before")
    @classmethod
    def _none_to_empty(cls, value):
        return [] if value is None else value
