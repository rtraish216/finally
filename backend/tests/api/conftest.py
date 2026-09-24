"""Fixtures for API/service tests: temp DB, deterministic (non-ticking) market source."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main
from app.market import MarketDataSource, PriceCache

PRICES = {
    "AAPL": 100.0, "GOOGL": 200.0, "MSFT": 300.0, "AMZN": 50.0, "TSLA": 250.0,
    "NVDA": 800.0, "META": 500.0, "JPM": 195.0, "V": 280.0, "NFLX": 600.0,
    "PYPL": 60.0,
}  # fmt: skip


class FixedPriceSource(MarketDataSource):
    """Seeds the cache once and never ticks, so tests can assert exact prices."""

    def __init__(self, cache: PriceCache) -> None:
        self.cache = cache
        self.tickers: list[str] = []

    async def start(self, tickers: list[str]) -> None:
        for ticker in tickers:
            await self.add_ticker(ticker)

    async def stop(self) -> None:
        pass

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self.tickers:
            self.tickers.append(ticker)
        self.cache.update(ticker, PRICES.get(ticker, 100.0))

    async def remove_ticker(self, ticker: str) -> None:
        if ticker in self.tickers:
            self.tickers.remove(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self.tickers)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "finally.db"))
    monkeypatch.setattr(main, "create_market_data_source", FixedPriceSource)
    monkeypatch.setattr(main, "find_static_dir", lambda: None)
    with TestClient(main.create_app()) as test_client:
        yield test_client


@pytest.fixture
def source(client):
    from app.services import runtime

    return runtime.state.source


@pytest.fixture
def set_price(client):
    from app.services import runtime

    def _set(ticker: str, price: float) -> None:
        runtime.get_cache().update(ticker, price)

    return _set
