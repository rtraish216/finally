"""SSE route wiring: the stream serves the app's own price cache."""

from __future__ import annotations

import json

from app.market.stream import _generate_events
from app.services import runtime


class _Request:
    client = None

    def __init__(self):
        self.calls = 0

    async def is_disconnected(self):
        self.calls += 1
        return self.calls > 1


def test_stream_route_registered(client):
    paths = {route.path for route in client.app.routes}
    assert "/api/stream/prices" in paths


async def test_stream_payload_contains_tracked_tickers_with_session_start(client):
    events = [e async for e in _generate_events(runtime.get_cache(), _Request(), interval=0)]
    data_line = next(e for e in events if e.startswith("data: "))
    payload = json.loads(data_line[len("data: ") :])
    assert set(payload) == {
        "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"
    }  # fmt: skip
    assert set(payload["AAPL"]) == {
        "ticker", "price", "previous_price", "session_start_price", "timestamp",
        "change", "change_percent", "direction",
    }  # fmt: skip
