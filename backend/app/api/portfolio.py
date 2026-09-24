"""Portfolio endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app import services

from .schemas import HistoryResponse, PortfolioResponse, TradeRequest, TradeResponse

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioResponse)
async def get_portfolio() -> dict:
    return services.get_portfolio()


@router.post("/trade", response_model=TradeResponse)
async def trade(request: TradeRequest) -> dict:
    return await services.execute_trade(request.ticker, request.side, request.quantity)


@router.get("/history", response_model=HistoryResponse)
async def history() -> dict:
    return {"snapshots": services.get_history()}
