"""Watchlist endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app import services

from .schemas import TickerRequest, TickerResponse, WatchlistResponse

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=WatchlistResponse)
async def get_watchlist() -> dict:
    return {"watchlist": services.get_watchlist()}


@router.post("", response_model=TickerResponse)
async def add_ticker(request: TickerRequest) -> dict:
    return await services.add_to_watchlist(request.ticker)


@router.delete("/{ticker}", response_model=TickerResponse)
async def remove_ticker(ticker: str) -> dict:
    return await services.remove_from_watchlist(ticker)
