"""Chat flow with fake services, storage and LLM."""

from app.llm import handle_chat
from app.llm.chat import EMPTY_RESPONSE_MESSAGE, LLM_ERROR_MESSAGE, MISSING_KEY_MESSAGE

NO_ACTIONS = {"trades": [], "watchlist_changes": []}


async def chat(backend, message="hi"):
    return await handle_chat(message, backend.deps())


async def test_plain_reply(backend, with_key):
    backend.llm_output = {"message": "Hello!", "trades": [], "watchlist_changes": []}
    result = await chat(backend)
    assert result == {"message": "Hello!", **NO_ACTIONS}


async def test_executes_trade_and_watchlist_change(backend, with_key):
    backend.llm_output = {
        "message": "Done",
        "trades": [{"ticker": "aapl", "side": "buy", "quantity": 5}],
        "watchlist_changes": [{"ticker": "pypl", "action": "add"}],
    }
    result = await chat(backend)
    assert backend.trade_calls == [("AAPL", "buy", 5)]
    assert backend.watchlist_calls == [("add", "PYPL")]
    assert result["trades"] == [
        {"ticker": "AAPL", "side": "buy", "quantity": 5, "price": 100.0, "status": "executed"}
    ]
    assert result["watchlist_changes"] == [
        {"ticker": "PYPL", "action": "add", "status": "executed"}
    ]


async def test_failed_trade_does_not_stop_others(backend, with_key):
    backend.llm_output = {
        "message": "Trying",
        "trades": [
            {"ticker": "NVDA", "side": "sell", "quantity": 3},  # no shares -> fails
            {"ticker": "AAPL", "side": "buy", "quantity": 1},  # succeeds
            {"ticker": "MSFT", "side": "buy", "quantity": 1000},  # not enough cash -> fails
        ],
    }
    result = await chat(backend)
    statuses = [(t["ticker"], t["status"]) for t in result["trades"]]
    assert statuses == [("NVDA", "failed"), ("AAPL", "executed"), ("MSFT", "failed")]
    assert result["trades"][0]["error"] == "Insufficient shares"
    assert result["trades"][2]["error"] == "Insufficient cash"
    assert "price" not in result["trades"][0]


async def test_invalid_trades_rejected_before_service(backend, with_key):
    backend.llm_output = {
        "message": "x",
        "trades": [
            {"ticker": "AAPL", "side": "hold", "quantity": 1},
            {"ticker": "AAPL", "side": "buy", "quantity": 0},
            {"ticker": "AAPL", "side": "buy", "quantity": -2},
            {"ticker": "", "side": "buy", "quantity": 1},
        ],
    }
    result = await chat(backend)
    assert backend.trade_calls == []
    assert [t["status"] for t in result["trades"]] == ["failed"] * 4


async def test_watchlist_failure_reported(backend, with_key):
    backend.llm_output = {
        "message": "x",
        "watchlist_changes": [
            {"ticker": "ZZZZ", "action": "add"},
            {"ticker": "NFLX", "action": "remove"},
            {"ticker": "NFLX", "action": "toggle"},
        ],
    }
    result = await chat(backend)
    changes = result["watchlist_changes"]
    assert [c["status"] for c in changes] == ["failed", "executed", "failed"]
    assert changes[0]["error"] == "Unknown ticker: ZZZZ"
    assert backend.watchlist_calls == [("add", "ZZZZ"), ("remove", "NFLX")]


async def test_http_exception_style_detail_used_as_error(backend, with_key):
    class BoomError(Exception):
        detail = "Human readable detail"

    async def failing(*args):
        raise BoomError("ignored")

    backend.llm_output = {
        "message": "x",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}],
    }
    deps = backend.deps()
    deps.execute_trade = failing
    result = await handle_chat("buy", deps)
    assert result["trades"][0]["error"] == "Human readable detail"


async def test_persists_user_and_assistant_messages(backend, with_key):
    backend.llm_output = {
        "message": "Bought",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}],
    }
    result = await chat(backend, "buy one")
    assert backend.saved[0] == {"role": "user", "content": "buy one", "actions": None}
    assert backend.saved[1] == {
        "role": "assistant",
        "content": "Bought",
        "actions": {"trades": result["trades"], "watchlist_changes": []},
    }


async def test_prompt_contains_portfolio_history_and_message(backend, with_key):
    backend.llm_output = {"message": "ok"}
    backend.history = [
        {"role": "user", "content": "earlier question", "actions": None},
        {
            "role": "assistant",
            "content": "earlier answer",
            "actions": {
                "trades": [
                    {
                        "ticker": "NVDA",
                        "side": "sell",
                        "quantity": 3,
                        "status": "failed",
                        "error": "Insufficient shares",
                    }
                ],
                "watchlist_changes": [],
            },
        },
    ]
    await chat(backend, "what now?")
    messages = backend.llm_calls[0]
    assert messages[0]["role"] == "system" and "FinAlly" in messages[0]["content"]
    assert "cash_balance" in messages[1]["content"]
    assert messages[2] == {"role": "user", "content": "earlier question"}
    assert (
        messages[3]["role"] == "assistant"
        and "FAILED: Insufficient shares" in messages[3]["content"]
    )
    assert messages[-1] == {"role": "user", "content": "what now?"}
    # the new user message is not duplicated via history
    assert sum(m["content"] == "what now?" for m in messages) == 1


async def test_portfolio_context_failure_is_tolerated(backend, with_key):
    backend.llm_output = {"message": "ok"}
    backend.portfolio_error = RuntimeError("db down")
    result = await chat(backend)
    assert result["message"] == "ok"
    assert "unavailable" in backend.llm_calls[0][1]["content"]


async def test_malformed_output_returns_raw_text(backend, with_key):
    backend.llm_output = "Sorry, plain text instead of JSON"
    result = await chat(backend)
    assert result == {"message": "Sorry, plain text instead of JSON", **NO_ACTIONS}
    assert backend.trade_calls == []
    assert backend.saved[-1]["content"] == "Sorry, plain text instead of JSON"


async def test_empty_output(backend, with_key):
    backend.llm_output = "   "
    result = await chat(backend)
    assert result == {"message": EMPTY_RESPONSE_MESSAGE, **NO_ACTIONS}


async def test_llm_error_is_friendly(backend, with_key):
    backend.llm_error = TimeoutError("timed out")
    result = await chat(backend)
    assert result == {"message": LLM_ERROR_MESSAGE, **NO_ACTIONS}
    assert backend.saved[-1]["role"] == "assistant"


async def test_missing_api_key_returns_friendly_message(backend):
    result = await chat(backend)
    assert result == {"message": MISSING_KEY_MESSAGE, **NO_ACTIONS}
    assert backend.llm_calls == []


async def test_placeholder_api_key_treated_as_missing(backend, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "your-openrouter-api-key-here")
    result = await chat(backend)
    assert result["message"] == MISSING_KEY_MESSAGE


async def test_persistence_failure_does_not_break_chat(backend, with_key):
    backend.llm_output = {"message": "still works"}

    def broken(*args, **kwargs):
        raise RuntimeError("disk full")

    deps = backend.deps()
    deps.add_chat_message = broken
    result = await handle_chat("hi", deps)
    assert result["message"] == "still works"


async def test_mock_mode_uses_mock_llm_without_key(backend, monkeypatch):
    """LLM_MOCK=true: no API key needed and default LLM is the offline mock."""
    from app.llm import chat as chat_module
    from app.llm.mock import mock_call_llm

    monkeypatch.setenv("LLM_MOCK", "true")
    deps = backend.deps()
    deps.call_llm = mock_call_llm
    result = await handle_chat("buy 2 AAPL and add PYPL", deps)
    assert result["trades"][0]["status"] == "executed"
    assert result["watchlist_changes"][0] == {
        "ticker": "PYPL",
        "action": "add",
        "status": "executed",
    }
    assert chat_module.default_deps().call_llm is mock_call_llm


async def test_mock_mode_failing_trade(backend, monkeypatch):
    from app.llm.mock import mock_call_llm

    monkeypatch.setenv("LLM_MOCK", "true")
    deps = backend.deps()
    deps.call_llm = mock_call_llm
    result = await handle_chat("sell 9999 AAPL", deps)
    assert result["trades"][0]["status"] == "failed"


async def test_default_call_llm_uses_cerebras_structured_output(monkeypatch):
    """The real client passes the schema/provider to LiteLLM; the network call is faked."""
    import litellm

    from app.llm import client
    from app.llm.schemas import LLMResponse

    captured = {}

    class Msg:
        content = '{"message": "hi"}'

    class Choice:
        message = Msg()

    class Resp:
        choices = [Choice()]

    async def fake_acompletion(**kwargs):
        captured.update(kwargs)
        return Resp()

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    out = await client.call_llm([{"role": "user", "content": "x"}])
    assert out == '{"message": "hi"}'
    assert captured["model"] == "openrouter/openai/gpt-oss-120b"
    assert captured["response_format"] is LLMResponse
    assert captured["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert captured["timeout"] > 0


async def test_real_services_wiring_imports():
    """default_deps binds to the real services layer (no calls made)."""
    from app.llm.chat import default_deps

    deps = default_deps()
    assert callable(deps.execute_trade) and callable(deps.add_chat_message)
