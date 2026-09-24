"""API tests: status codes, response shapes and error handling."""

from __future__ import annotations

import sys
import types

DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


def buy(client, ticker="AAPL", quantity=10):
    return client.post(
        "/api/portfolio/trade", json={"ticker": ticker, "quantity": quantity, "side": "buy"}
    )


def sell(client, ticker="AAPL", quantity=10):
    return client.post(
        "/api/portfolio/trade", json={"ticker": ticker, "quantity": quantity, "side": "sell"}
    )


class TestHealth:
    def test_health(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_unknown_api_route_is_json_404(self, client):
        response = client.get("/api/nope")
        assert response.status_code == 404
        assert "detail" in response.json()


class TestPortfolio:
    def test_fresh_portfolio(self, client):
        data = client.get("/api/portfolio").json()
        assert data == {
            "cash_balance": 10000.0,
            "total_value": 10000.0,
            "unrealized_pnl": 0.0,
            "positions": [],
        }

    def test_buy_response_shape_and_effects(self, client):
        response = buy(client, "AAPL", 10)
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"ticker", "side", "quantity", "price", "executed_at", "cash_balance"}
        assert body["price"] == 100.0
        assert body["cash_balance"] == 9000.0

        portfolio = client.get("/api/portfolio").json()
        assert portfolio["cash_balance"] == 9000.0
        assert portfolio["total_value"] == 10000.0
        assert portfolio["positions"] == [
            {
                "ticker": "AAPL",
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 100.0,
                "market_value": 1000.0,
                "unrealized_pnl": 0.0,
                "unrealized_pnl_percent": 0.0,
            }
        ]

    def test_unrealized_pnl_follows_price(self, client, set_price):
        buy(client, "AAPL", 10)
        set_price("AAPL", 110.0)
        data = client.get("/api/portfolio").json()
        assert data["unrealized_pnl"] == 100.0
        assert data["total_value"] == 10100.0
        position = data["positions"][0]
        assert position["unrealized_pnl"] == 100.0
        assert position["unrealized_pnl_percent"] == 10.0

    def test_weighted_average_cost(self, client, set_price):
        buy(client, "AAPL", 10)
        set_price("AAPL", 120.0)
        buy(client, "AAPL", 10)
        position = client.get("/api/portfolio").json()["positions"][0]
        assert position["quantity"] == 20
        assert position["avg_cost"] == 110.0

    def test_fractional_shares(self, client):
        assert buy(client, "AAPL", 0.5).status_code == 200
        assert client.get("/api/portfolio").json()["positions"][0]["quantity"] == 0.5

    def test_sell_partial_then_all_removes_position(self, client, set_price):
        buy(client, "AAPL", 10)
        set_price("AAPL", 110.0)
        response = sell(client, "AAPL", 4)
        assert response.status_code == 200
        assert response.json()["cash_balance"] == 9000.0 + 440.0
        assert client.get("/api/portfolio").json()["positions"][0]["quantity"] == 6

        assert sell(client, "AAPL", 6).status_code == 200
        data = client.get("/api/portfolio").json()
        assert data["positions"] == []
        assert data["cash_balance"] == 10100.0

    def test_sell_at_a_loss(self, client, set_price):
        buy(client, "AAPL", 10)
        set_price("AAPL", 90.0)
        sell(client, "AAPL", 10)
        assert client.get("/api/portfolio").json()["cash_balance"] == 9900.0

    def test_ticker_and_side_are_normalised(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": " aapl ", "quantity": 1, "side": "BUY"}
        )
        assert response.status_code == 200
        assert response.json()["ticker"] == "AAPL"
        assert response.json()["side"] == "buy"

    def test_insufficient_cash(self, client):
        response = buy(client, "AAPL", 101)  # 101 * 100 > 10000
        assert response.status_code == 400
        assert "cash" in response.json()["detail"].lower()
        assert client.get("/api/portfolio").json()["cash_balance"] == 10000.0

    def test_sell_more_than_owned(self, client):
        buy(client, "AAPL", 5)
        response = sell(client, "AAPL", 6)
        assert response.status_code == 400
        assert "shares" in response.json()["detail"].lower()

    def test_sell_without_position(self, client):
        response = sell(client, "AAPL", 1)
        assert response.status_code == 400

    def test_invalid_quantity(self, client):
        for quantity in (0, -3):
            response = buy(client, "AAPL", quantity)
            assert response.status_code == 400
            assert isinstance(response.json()["detail"], str)

    def test_invalid_side(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "hold"}
        )
        assert response.status_code == 400

    def test_missing_fields_is_400_with_detail(self, client):
        response = client.post("/api/portfolio/trade", json={"ticker": "AAPL"})
        assert response.status_code == 400
        assert isinstance(response.json()["detail"], str)

    def test_non_numeric_quantity(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": "lots", "side": "buy"}
        )
        assert response.status_code == 400

    def test_unknown_ticker_is_404(self, client):
        response = buy(client, "ZZZZ", 1)
        assert response.status_code == 404
        assert "ZZZZ" in response.json()["detail"]

    def test_malformed_ticker_is_400(self, client):
        assert buy(client, "12$", 1).status_code == 400

    def test_trade_of_unwatched_ticker_tracks_it_while_held(self, client, source):
        assert "PYPL" not in source.get_tickers()
        assert buy(client, "PYPL", 1).status_code == 200
        assert "PYPL" in source.get_tickers()
        assert sell(client, "PYPL", 1).status_code == 200
        assert "PYPL" not in source.get_tickers()

    def test_failed_trade_of_unwatched_ticker_is_not_left_tracked(self, client, source):
        assert sell(client, "PYPL", 1).status_code == 400
        assert "PYPL" not in source.get_tickers()


class TestHistory:
    def test_initial_snapshot_recorded_at_startup(self, client):
        snapshots = client.get("/api/portfolio/history").json()["snapshots"]
        assert len(snapshots) == 1
        assert snapshots[0]["total_value"] == 10000.0
        assert snapshots[0]["recorded_at"].endswith("Z")

    def test_snapshot_after_each_trade_oldest_first(self, client, set_price):
        buy(client, "AAPL", 10)
        set_price("AAPL", 110.0)
        sell(client, "AAPL", 10)
        values = [s["total_value"] for s in client.get("/api/portfolio/history").json()["snapshots"]]
        assert values == [10000.0, 10000.0, 10100.0]

    def test_failed_trade_records_no_snapshot(self, client):
        buy(client, "AAPL", 1000)
        assert len(client.get("/api/portfolio/history").json()["snapshots"]) == 1


class TestWatchlist:
    def test_default_watchlist(self, client):
        items = client.get("/api/watchlist").json()["watchlist"]
        assert [i["ticker"] for i in items] == DEFAULT_TICKERS
        assert items[0] == {
            "ticker": "AAPL",
            "price": 100.0,
            "previous_price": 100.0,
            "session_start_price": 100.0,
        }

    def test_add_ticker_starts_tracking(self, client, source):
        response = client.post("/api/watchlist", json={"ticker": "pypl"})
        assert response.status_code == 200
        assert response.json() == {"ticker": "PYPL"}
        assert "PYPL" in source.get_tickers()
        tickers = [i["ticker"] for i in client.get("/api/watchlist").json()["watchlist"]]
        assert tickers[-1] == "PYPL"

    def test_add_existing_is_noop_success(self, client):
        response = client.post("/api/watchlist", json={"ticker": "AAPL"})
        assert response.status_code == 200
        assert len(client.get("/api/watchlist").json()["watchlist"]) == 10

    def test_add_unknown_is_404(self, client):
        response = client.post("/api/watchlist", json={"ticker": "ZZZZ"})
        assert response.status_code == 404
        assert "detail" in response.json()

    def test_add_malformed_is_400(self, client):
        assert client.post("/api/watchlist", json={"ticker": "not a ticker"}).status_code == 400
        assert client.post("/api/watchlist", json={}).status_code == 400

    def test_remove_ticker_stops_tracking(self, client, source):
        response = client.delete("/api/watchlist/AAPL")
        assert response.status_code == 200
        assert response.json() == {"ticker": "AAPL"}
        assert "AAPL" not in source.get_tickers()
        tickers = [i["ticker"] for i in client.get("/api/watchlist").json()["watchlist"]]
        assert "AAPL" not in tickers

    def test_remove_absent_ticker_is_noop_success(self, client):
        assert client.delete("/api/watchlist/PYPL").status_code == 200

    def test_removed_ticker_with_position_keeps_streaming(self, client, source):
        buy(client, "AAPL", 1)
        client.delete("/api/watchlist/AAPL")
        assert "AAPL" in source.get_tickers()
        # Selling the last share while off the watchlist drops it.
        sell(client, "AAPL", 1)
        assert "AAPL" not in source.get_tickers()

    def test_readd_ticker_with_position(self, client, source):
        buy(client, "AAPL", 1)
        client.delete("/api/watchlist/AAPL")
        client.post("/api/watchlist", json={"ticker": "AAPL"})
        sell(client, "AAPL", 1)
        assert "AAPL" in source.get_tickers()


class TestChat:
    def _install_fake_llm(self, monkeypatch, handler):
        module = types.ModuleType("app.llm")
        module.handle_chat = handler
        monkeypatch.setitem(sys.modules, "app.llm", module)

    def test_chat_delegates_and_returns_response(self, client, monkeypatch):
        payload = {
            "message": "Bought 5 AAPL",
            "trades": [
                {"ticker": "AAPL", "side": "buy", "quantity": 5, "price": 100.0, "status": "executed"}
            ],
            "watchlist_changes": [{"ticker": "PYPL", "action": "add", "status": "executed"}],
        }
        seen = []

        async def handle_chat(message):
            seen.append(message)
            return payload

        self._install_fake_llm(monkeypatch, handle_chat)
        response = client.post("/api/chat", json={"message": "buy 5 aapl"})
        assert response.status_code == 200
        assert seen == ["buy 5 aapl"]
        body = response.json()
        assert body["message"] == "Bought 5 AAPL"
        assert body["trades"][0]["status"] == "executed"
        assert body["watchlist_changes"][0]["action"] == "add"

    def test_chat_defaults_empty_action_arrays(self, client, monkeypatch):
        async def handle_chat(message):
            return {"message": "hi"}

        self._install_fake_llm(monkeypatch, handle_chat)
        body = client.post("/api/chat", json={"message": "hello"}).json()
        assert body == {"message": "hi", "trades": [], "watchlist_changes": []}

    def test_chat_empty_message_is_400(self, client):
        response = client.post("/api/chat", json={"message": "   "})
        assert response.status_code == 400

    def test_chat_missing_message_is_400(self, client):
        assert client.post("/api/chat", json={}).status_code == 400

    def test_chat_handler_crash_is_500_json(self, client, monkeypatch):
        async def handle_chat(message):
            raise RuntimeError("boom")

        self._install_fake_llm(monkeypatch, handle_chat)
        response = client.post("/api/chat", json={"message": "hello"})
        assert response.status_code == 500
        assert response.json() == {"detail": "Chat failed unexpectedly"}

    def test_chat_without_llm_module_returns_stub(self, client, monkeypatch):
        monkeypatch.setitem(sys.modules, "app.llm", None)  # makes the import raise ImportError
        response = client.post("/api/chat", json={"message": "hello"})
        assert response.status_code == 200
        assert response.json()["trades"] == []

    def test_history_shape_oldest_first(self, client):
        from app import db

        db.add_chat_message("user", "hello")
        db.add_chat_message(
            "assistant", "hi", {"trades": [], "watchlist_changes": []}
        )
        messages = client.get("/api/chat/history").json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert messages[0]["actions"] is None
        assert messages[1]["actions"] == {"trades": [], "watchlist_changes": []}
        assert set(messages[0]) == {"role", "content", "actions", "created_at"}

    def test_history_empty(self, client):
        assert client.get("/api/chat/history").json() == {"messages": []}


class TestStatic:
    def test_serves_static_export_after_api_routes(self, tmp_path, monkeypatch):
        from fastapi.testclient import TestClient

        from app import main
        from tests.api.conftest import FixedPriceSource

        static = tmp_path / "static"
        static.mkdir()
        (static / "index.html").write_text("<html>FinAlly</html>")
        monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "finally.db"))
        monkeypatch.setattr(main, "create_market_data_source", FixedPriceSource)
        monkeypatch.setattr(main, "find_static_dir", lambda: static)
        with TestClient(main.create_app()) as client:
            assert "FinAlly" in client.get("/").text
            assert client.get("/api/health").json() == {"status": "ok"}
            assert client.get("/api/portfolio").status_code == 200

    def test_starts_without_static_dir(self, client):
        assert client.get("/").status_code == 404
