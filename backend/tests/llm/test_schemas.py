"""Structured-output parsing: valid shapes and malformed responses."""

import pytest

from app.llm import LLMResponse, parse_llm_output


def test_full_response():
    r = parse_llm_output(
        '{"message": "Hi", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],'
        ' "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}'
    )
    assert r.message == "Hi"
    assert r.trades[0].ticker == "AAPL" and r.trades[0].quantity == 10
    assert r.watchlist_changes[0].action == "add"


def test_message_only():
    r = parse_llm_output('{"message": "Just talking"}')
    assert r.trades == [] and r.watchlist_changes == []


def test_null_lists_become_empty():
    r = parse_llm_output('{"message": "x", "trades": null, "watchlist_changes": null}')
    assert r.trades == [] and r.watchlist_changes == []


def test_fractional_quantity_and_whitespace_normalised():
    r = parse_llm_output(
        '{"message": "x", "trades": [{"ticker": " aapl ", "side": " Buy", "quantity": 0.5}]}'
    )
    assert r.trades[0].ticker == "aapl" and r.trades[0].side == "Buy"
    assert r.trades[0].quantity == 0.5


def test_code_fenced_json():
    r = parse_llm_output('```json\n{"message": "fenced"}\n```')
    assert r.message == "fenced"


def test_json_wrapped_in_prose():
    r = parse_llm_output('Sure! {"message": "wrapped", "trades": []} hope that helps')
    assert r.message == "wrapped"


@pytest.mark.parametrize(
    "raw",
    [
        "I am just plain text",
        "{not json}",
        "[]",
        '{"trades": []}',  # message missing
        '{"message": "x", "trades": [{"ticker": "AAPL"}]}',  # incomplete trade
        '{"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": "lots"}]}',
    ],
)
def test_malformed_returns_none(raw):
    assert parse_llm_output(raw) is None


def test_json_schema_is_strict_compatible():
    """litellm turns the model into a strict schema: every field required, no extras."""
    from litellm.utils import type_to_response_format_param

    fmt = type_to_response_format_param(LLMResponse)
    schema = fmt["json_schema"]["schema"]
    assert fmt["json_schema"]["strict"] is True
    assert set(schema["required"]) == {"message", "trades", "watchlist_changes"}
    assert schema["additionalProperties"] is False
