"""Tests for the database layer."""

import sqlite3
import threading

import pytest

from app import db
from app.db import connection
from app.db.schema import DEFAULT_TICKERS


class TestInit:
    def test_seeds_defaults(self, db_file):
        db.init_db()
        assert db_file.exists()
        assert db.get_cash() == 10000.0
        assert db.list_watchlist() == DEFAULT_TICKERS
        assert db.get_positions() == []

    def test_lazy_init_on_first_call(self, db_file):
        assert not db_file.exists()
        assert db.get_cash() == 10000.0
        assert db_file.exists()

    def test_idempotent_preserves_data(self):
        db.init_db()
        db.set_cash(5000.0)
        db.remove_watchlist("AAPL")
        db.init_db()
        assert db.get_cash() == 5000.0
        assert "AAPL" not in db.list_watchlist()

    def test_does_not_reseed_after_reopen(self):
        db.init_db()
        db.remove_watchlist("AAPL")
        connection._initialized.clear()  # simulate a fresh process
        db.init_db()
        assert "AAPL" not in db.list_watchlist()
        assert len(db.list_watchlist()) == 9

    def test_reinitialises_if_file_deleted(self, db_file):
        db.init_db()
        db_file.unlink()
        assert db.get_cash() == 10000.0

    def test_creates_parent_directory(self, tmp_path, monkeypatch):
        monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "nested" / "dir" / "x.db"))
        assert db.get_cash() == 10000.0

    def test_wal_mode(self, db_file):
        db.init_db()
        conn = sqlite3.connect(db_file)
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        conn.close()

    def test_schema_has_no_user_id(self, db_file):
        db.init_db()
        conn = sqlite3.connect(db_file)
        tables = [
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        ]
        for t in [
            "users_profile", "watchlist", "positions", "trades",
            "portfolio_snapshots", "chat_messages",
        ]:
            assert t in tables
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({t})")]
            assert "user_id" not in cols
        conn.close()


class TestCash:
    def test_set_and_get(self):
        db.set_cash(1234.5)
        assert db.get_cash() == 1234.5


class TestPositions:
    def test_upsert_get_delete(self):
        db.upsert_position("aapl", 10, 190.0)
        pos = db.get_position("AAPL")
        assert pos["quantity"] == 10
        assert pos["avg_cost"] == 190.0
        db.upsert_position("AAPL", 15, 195.0)
        assert len(db.get_positions()) == 1
        assert db.get_position("AAPL")["quantity"] == 15
        assert db.delete_position("AAPL") is True
        assert db.delete_position("AAPL") is False
        assert db.get_position("AAPL") is None

    def test_upsert_zero_quantity_deletes(self):
        db.upsert_position("AAPL", 10, 190.0)
        db.upsert_position("AAPL", 0, 190.0)
        assert db.get_position("AAPL") is None

    def test_unique_ticker_constraint(self, db_file):
        db.upsert_position("AAPL", 1, 1.0)
        conn = sqlite3.connect(db_file)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO positions (id, ticker, quantity, avg_cost, updated_at) "
                "VALUES ('x', 'AAPL', 1, 1, 't')"
            )
        conn.close()

    def test_ordered_by_ticker(self):
        db.upsert_position("MSFT", 1, 1.0)
        db.upsert_position("AAPL", 1, 1.0)
        assert [p["ticker"] for p in db.get_positions()] == ["AAPL", "MSFT"]


class TestApplyTrade:
    def test_buy_updates_cash_position_and_log(self):
        result = db.apply_trade("AAPL", "buy", 10, 190.0)
        assert result["cash_balance"] == pytest.approx(8100.0)
        assert result["ticker"] == "AAPL"
        assert result["side"] == "buy"
        assert result["executed_at"]
        assert db.get_cash() == pytest.approx(8100.0)
        pos = db.get_position("AAPL")
        assert pos["quantity"] == 10
        assert pos["avg_cost"] == pytest.approx(190.0)
        trades = db.list_trades()
        assert len(trades) == 1
        assert trades[0]["id"] == result["id"]

    def test_average_cost_on_repeat_buys(self):
        db.apply_trade("AAPL", "buy", 10, 100.0)
        db.apply_trade("AAPL", "buy", 30, 200.0)
        pos = db.get_position("AAPL")
        assert pos["quantity"] == 40
        assert pos["avg_cost"] == pytest.approx((10 * 100 + 30 * 200) / 40)
        assert db.get_cash() == pytest.approx(10000 - 1000 - 6000)

    def test_partial_sell_keeps_avg_cost(self):
        db.apply_trade("AAPL", "buy", 10, 100.0)
        result = db.apply_trade("AAPL", "sell", 4, 150.0)
        pos = db.get_position("AAPL")
        assert pos["quantity"] == pytest.approx(6)
        assert pos["avg_cost"] == pytest.approx(100.0)
        assert result["cash_balance"] == pytest.approx(10000 - 1000 + 600)

    def test_full_sell_removes_position(self):
        db.apply_trade("AAPL", "buy", 10, 100.0)
        db.apply_trade("AAPL", "sell", 10, 90.0)
        assert db.get_position("AAPL") is None
        assert db.get_cash() == pytest.approx(10000 - 1000 + 900)
        assert len(db.list_trades()) == 2

    def test_fractional_shares(self):
        db.apply_trade("AAPL", "buy", 0.5, 200.0)
        assert db.get_position("AAPL")["quantity"] == 0.5
        assert db.get_cash() == pytest.approx(9900.0)
        db.apply_trade("AAPL", "sell", 0.5, 200.0)
        assert db.get_position("AAPL") is None
        assert db.get_cash() == pytest.approx(10000.0)

    def test_fractional_sell_float_dust_removes_position(self):
        db.apply_trade("AAPL", "buy", 0.1, 100.0)
        db.apply_trade("AAPL", "buy", 0.2, 100.0)
        db.apply_trade("AAPL", "sell", 0.3, 100.0)  # 0.1 + 0.2 != 0.3 in floating point
        assert db.get_position("AAPL") is None

    def test_buy_entire_cash(self):
        db.apply_trade("AAPL", "buy", 100, 100.0)
        assert db.get_cash() == pytest.approx(0.0)

    def test_side_and_ticker_normalised(self):
        result = db.apply_trade(" aapl ", "BUY", 1, 100.0)
        assert result["ticker"] == "AAPL"
        assert result["side"] == "buy"

    def test_insufficient_cash_rolls_back(self):
        with pytest.raises(db.InsufficientCashError, match="Insufficient cash"):
            db.apply_trade("AAPL", "buy", 100, 101.0)
        assert db.get_cash() == 10000.0
        assert db.get_positions() == []
        assert db.list_trades() == []

    def test_insufficient_shares_rolls_back(self):
        db.apply_trade("AAPL", "buy", 5, 100.0)
        with pytest.raises(db.InsufficientSharesError, match="Insufficient shares"):
            db.apply_trade("AAPL", "sell", 6, 100.0)
        assert db.get_cash() == pytest.approx(9500.0)
        assert db.get_position("AAPL")["quantity"] == 5
        assert len(db.list_trades()) == 1

    def test_sell_without_position(self):
        with pytest.raises(db.InsufficientSharesError):
            db.apply_trade("AAPL", "sell", 1, 100.0)

    @pytest.mark.parametrize(
        ("side", "qty", "price"),
        [
            ("hold", 1, 1.0),
            ("buy", 0, 1.0),
            ("buy", -1, 1.0),
            ("buy", 1, 0),
            ("buy", float("nan"), 1.0),
            ("buy", float("inf"), 1.0),
            ("buy", 1, float("nan")),
        ],
    )
    def test_invalid_input(self, side, qty, price):
        with pytest.raises(db.InvalidTradeError):
            db.apply_trade("AAPL", side, qty, price)
        assert db.get_cash() == 10000.0
        assert db.list_trades() == []

    def test_errors_are_value_errors(self):
        assert issubclass(db.InsufficientCashError, db.TradeError)
        assert issubclass(db.TradeError, ValueError)

    def test_mid_transaction_failure_rolls_back_everything(self, monkeypatch):
        """If the trade-log insert fails, cash and position changes must not persist."""
        from app.db import repository

        def boom(*args, **kwargs):
            raise RuntimeError("disk full")

        monkeypatch.setattr(repository, "_insert_trade", boom)
        with pytest.raises(RuntimeError):
            db.apply_trade("AAPL", "buy", 1, 100.0)
        assert db.get_cash() == 10000.0
        assert db.get_positions() == []

    def test_concurrent_trades_are_serialised(self):
        errors = []

        def worker():
            try:
                for _ in range(10):
                    db.apply_trade("AAPL", "buy", 1, 10.0)
            except Exception as e:  # pragma: no cover
                errors.append(e)

        db.init_db()
        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []
        assert db.get_position("AAPL")["quantity"] == 40
        assert db.get_cash() == pytest.approx(10000 - 400)
        assert len(db.list_trades()) == 40


class TestTrades:
    def test_record_trade_only_logs(self):
        db.record_trade("AAPL", "buy", 5, 100.0)
        assert db.get_cash() == 10000.0
        assert db.get_positions() == []
        assert len(db.list_trades()) == 1

    def test_list_newest_first_with_limit(self):
        db.apply_trade("AAPL", "buy", 1, 10.0)
        db.apply_trade("MSFT", "buy", 1, 10.0)
        db.apply_trade("NVDA", "buy", 1, 10.0)
        assert [t["ticker"] for t in db.list_trades()] == ["NVDA", "MSFT", "AAPL"]
        assert [t["ticker"] for t in db.list_trades(limit=2)] == ["NVDA", "MSFT"]

    def test_side_check_constraint(self, db_file):
        db.init_db()
        conn = sqlite3.connect(db_file)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO trades (id, ticker, side, quantity, price, executed_at) "
                "VALUES ('x', 'AAPL', 'hold', 1, 1, 't')"
            )
        conn.close()


class TestWatchlist:
    def test_add_and_remove(self):
        assert db.add_watchlist("pypl") is True
        assert db.list_watchlist()[-1] == "PYPL"
        assert db.remove_watchlist("PYPL") is True
        assert "PYPL" not in db.list_watchlist()

    def test_add_duplicate_is_noop(self):
        assert db.add_watchlist("AAPL") is False
        assert db.list_watchlist().count("AAPL") == 1

    def test_remove_missing(self):
        assert db.remove_watchlist("ZZZZ") is False

    def test_add_empty_ticker_rejected(self):
        with pytest.raises(ValueError):
            db.add_watchlist("  ")

    def test_unique_constraint(self, db_file):
        db.init_db()
        conn = sqlite3.connect(db_file)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO watchlist (id, ticker, added_at) VALUES ('x', 'AAPL', 't')"
            )
        conn.close()


class TestSnapshots:
    def test_oldest_first(self):
        db.record_snapshot(10000.0)
        db.record_snapshot(10100.0)
        snaps = db.list_snapshots()
        assert [s["total_value"] for s in snaps] == [10000.0, 10100.0]
        assert set(snaps[0]) == {"total_value", "recorded_at"}

    def test_limit_returns_most_recent_oldest_first(self):
        for v in (1.0, 2.0, 3.0, 4.0):
            db.record_snapshot(v)
        assert [s["total_value"] for s in db.list_snapshots(limit=2)] == [3.0, 4.0]


class TestChat:
    def test_roundtrip_with_actions(self):
        db.add_chat_message("user", "buy aapl")
        actions = {
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 5, "status": "executed"}],
            "watchlist_changes": [],
        }
        db.add_chat_message("assistant", "Done", actions)
        msgs = db.list_chat_messages()
        assert [m["role"] for m in msgs] == ["user", "assistant"]
        assert msgs[0]["actions"] is None
        assert msgs[1]["actions"] == actions

    def test_limit_returns_most_recent_oldest_first(self):
        for i in range(5):
            db.add_chat_message("user", f"m{i}")
        assert [m["content"] for m in db.list_chat_messages(limit=3)] == ["m2", "m3", "m4"]

    def test_invalid_role(self):
        with pytest.raises(ValueError):
            db.add_chat_message("system", "hi")
