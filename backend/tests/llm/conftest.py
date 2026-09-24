"""Fixtures for LLM tests: isolated env and fake dependencies (no network, no DB)."""

import json

import pytest

from app.llm import ChatDeps, config


@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    """Ignore the real .env and any ambient LLM settings."""
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / "missing.env")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MOCK", raising=False)


class FakeBackend:
    """Records calls and simulates services, chat storage and the LLM."""

    def __init__(self, llm_output="", cash=10000.0, holdings=None):
        self.llm_output = llm_output
        self.cash = cash
        self.holdings = dict(holdings or {})
        self.history: list[dict] = []
        self.saved: list[dict] = []
        self.trade_calls: list[tuple] = []
        self.watchlist_calls: list[tuple] = []
        self.llm_calls: list[list[dict]] = []
        self.llm_error: Exception | None = None
        self.portfolio_error: Exception | None = None

    def get_portfolio_context(self):
        if self.portfolio_error:
            raise self.portfolio_error
        return {
            "cash_balance": self.cash,
            "total_value": self.cash,
            "positions": [],
            "watchlist": [],
        }

    async def execute_trade(self, ticker, side, quantity):
        self.trade_calls.append((ticker, side, quantity))
        if side == "buy":
            cost = quantity * 100
            if cost > self.cash:
                raise ValueError("Insufficient cash")
            self.cash -= cost
            self.holdings[ticker] = self.holdings.get(ticker, 0) + quantity
        else:
            if self.holdings.get(ticker, 0) < quantity:
                raise ValueError("Insufficient shares")
            self.holdings[ticker] -= quantity
        return {"ticker": ticker, "side": side, "quantity": quantity, "price": 100.0}

    def add_to_watchlist(self, ticker):
        self.watchlist_calls.append(("add", ticker))
        if ticker == "ZZZZ":
            raise ValueError("Unknown ticker: ZZZZ")
        return {"ticker": ticker, "added": True}

    async def remove_from_watchlist(self, ticker):
        self.watchlist_calls.append(("remove", ticker))
        return {"ticker": ticker, "removed": True}

    def list_chat_messages(self, limit):
        return self.history[-limit:]

    def add_chat_message(self, role, content, actions=None):
        self.saved.append({"role": role, "content": content, "actions": actions})

    async def call_llm(self, messages):
        self.llm_calls.append(messages)
        if self.llm_error:
            raise self.llm_error
        output = self.llm_output
        return output if isinstance(output, str) else json.dumps(output)

    def deps(self) -> ChatDeps:
        return ChatDeps(
            get_portfolio_context=self.get_portfolio_context,
            execute_trade=self.execute_trade,
            add_to_watchlist=self.add_to_watchlist,
            remove_from_watchlist=self.remove_from_watchlist,
            list_chat_messages=self.list_chat_messages,
            add_chat_message=self.add_chat_message,
            call_llm=self.call_llm,
        )


@pytest.fixture
def backend():
    return FakeBackend()


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
