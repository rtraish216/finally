"""Chat flow: context -> LLM -> parse -> auto-execute -> persist -> respond."""

import inspect
import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from .client import call_llm
from .config import HISTORY_LIMIT, get_api_key, is_mock_mode
from .mock import mock_call_llm
from .prompt import build_messages
from .schemas import LLMResponse

logger = logging.getLogger(__name__)

MISSING_KEY_MESSAGE = (
    "The AI assistant isn't configured: OPENROUTER_API_KEY is missing. "
    "Add it to the .env file and restart the app."
)
LLM_ERROR_MESSAGE = "Sorry, I couldn't reach the AI service just now. Please try again in a moment."
EMPTY_RESPONSE_MESSAGE = "Sorry, the AI service returned an empty response. Please try again."


@dataclass
class ChatDeps:
    """Everything handle_chat touches outside this package, injectable for tests."""

    get_portfolio_context: Callable[[], Any]
    execute_trade: Callable[[str, str, float], Any]
    add_to_watchlist: Callable[[str], Any]
    remove_from_watchlist: Callable[[str], Any]
    list_chat_messages: Callable[[int], list[dict]]
    add_chat_message: Callable[..., Any]
    call_llm: Callable[[list[dict]], Awaitable[str]]


def default_deps() -> ChatDeps:
    """Wire up the real services, DB and LLM client (imported lazily)."""
    from app import services
    from app.db import add_chat_message, list_chat_messages

    return ChatDeps(
        get_portfolio_context=services.get_portfolio_context,
        execute_trade=services.execute_trade,
        add_to_watchlist=services.add_to_watchlist,
        remove_from_watchlist=services.remove_from_watchlist,
        list_chat_messages=list_chat_messages,
        add_chat_message=add_chat_message,
        call_llm=mock_call_llm if is_mock_mode() else call_llm,
    )


async def _call(fn: Callable, *args):
    """Call a sync or async function."""
    result = fn(*args)
    if inspect.isawaitable(result):
        result = await result
    return result


def _error_text(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail or exc) or exc.__class__.__name__


def parse_llm_output(raw: str) -> LLMResponse | None:
    """Parse the model's JSON (tolerating code fences); None if it doesn't match the schema."""
    text = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S | re.I)
    if fenced:
        text = fenced.group(1)
    try:
        return LLMResponse.model_validate_json(text)
    except (ValidationError, ValueError):
        pass
    # Some models wrap JSON in prose; try the outermost object.
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        try:
            return LLMResponse.model_validate(json.loads(text[start : end + 1]))
        except (ValidationError, ValueError):
            pass
    return None


async def _execute_trades(response: LLMResponse, deps: ChatDeps) -> list[dict]:
    results = []
    for trade in response.trades:
        ticker, side, quantity = trade.ticker.upper(), trade.side.lower(), trade.quantity
        entry: dict = {"ticker": ticker, "side": side, "quantity": quantity}
        try:
            if not ticker:
                raise ValueError("Missing ticker")
            if side not in ("buy", "sell"):
                raise ValueError(f"Invalid side '{trade.side}' (must be buy or sell)")
            if not quantity > 0 or quantity == float("inf"):
                raise ValueError("Quantity must be greater than zero")
            filled = await _call(deps.execute_trade, ticker, side, quantity)
            price = filled.get("price") if isinstance(filled, dict) else None
            entry.update({"price": price, "status": "executed"})
        except Exception as exc:  # each trade is independent; report and continue
            entry.update({"status": "failed", "error": _error_text(exc)})
        results.append(entry)
    return results


async def _apply_watchlist_changes(response: LLMResponse, deps: ChatDeps) -> list[dict]:
    results = []
    for change in response.watchlist_changes:
        ticker, action = change.ticker.upper(), change.action.lower()
        entry = {"ticker": ticker, "action": action}
        try:
            if not ticker:
                raise ValueError("Missing ticker")
            if action == "add":
                await _call(deps.add_to_watchlist, ticker)
            elif action == "remove":
                await _call(deps.remove_from_watchlist, ticker)
            else:
                raise ValueError(f"Invalid action '{change.action}' (must be add or remove)")
            entry["status"] = "executed"
        except Exception as exc:
            entry.update({"status": "failed", "error": _error_text(exc)})
        results.append(entry)
    return results


def _persist(deps: ChatDeps, role: str, content: str, actions: dict | None = None) -> None:
    try:
        deps.add_chat_message(role, content, actions)
    except Exception:
        logger.exception("Failed to persist %s chat message", role)


async def handle_chat(message: str, deps: ChatDeps | None = None) -> dict:
    """Process one user chat message and return the API.md chat response.

    Never raises for LLM problems (missing key, timeout, malformed output): those come back
    as a friendly `message` with empty action arrays.
    """
    empty = {"trades": [], "watchlist_changes": []}

    if not is_mock_mode() and not get_api_key():
        # Checked before default_deps() so the app degrades gracefully without a key.
        deps = deps or default_deps()
        _persist(deps, "user", message)
        _persist(deps, "assistant", MISSING_KEY_MESSAGE, dict(empty))
        return {"message": MISSING_KEY_MESSAGE, **empty}

    deps = deps or default_deps()

    try:
        history = deps.list_chat_messages(HISTORY_LIMIT)
    except Exception:
        logger.exception("Failed to load chat history")
        history = []
    try:
        portfolio = await _call(deps.get_portfolio_context)
    except Exception:
        logger.exception("Failed to load portfolio context")
        portfolio = None

    _persist(deps, "user", message)

    try:
        raw = await deps.call_llm(build_messages(message, portfolio, history))
    except Exception:
        logger.exception("LLM call failed")
        _persist(deps, "assistant", LLM_ERROR_MESSAGE, dict(empty))
        return {"message": LLM_ERROR_MESSAGE, **empty}

    raw = (raw or "").strip()
    if not raw:
        _persist(deps, "assistant", EMPTY_RESPONSE_MESSAGE, dict(empty))
        return {"message": EMPTY_RESPONSE_MESSAGE, **empty}

    parsed = parse_llm_output(raw)
    if parsed is None:
        logger.warning("Unparseable LLM output; returning raw text")
        _persist(deps, "assistant", raw, dict(empty))
        return {"message": raw, **empty}

    trades = await _execute_trades(parsed, deps)
    watchlist_changes = await _apply_watchlist_changes(parsed, deps)
    actions = {"trades": trades, "watchlist_changes": watchlist_changes}
    _persist(deps, "assistant", parsed.message, actions)
    return {"message": parsed.message, **actions}
