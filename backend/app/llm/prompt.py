"""Prompt construction for the FinAlly assistant."""

import json

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant inside a simulated trading workstation.
The user trades a virtual portfolio with fake money using market orders that fill instantly.

You can:
- Analyze portfolio composition, risk concentration and P&L.
- Suggest trades with brief reasoning.
- Execute trades: when the user asks for a trade or agrees to one you suggested, include it in "trades". It runs automatically with no confirmation.
- Manage the watchlist: add or remove tickers via "watchlist_changes", proactively when useful.

Rules:
- Be concise and data-driven. Use the portfolio data provided; never invent prices or holdings.
- Only include trades the user asked for or agreed to. If a request is ambiguous (missing ticker or quantity), ask a question and include no trades.
- Trade "side" is "buy" or "sell"; "quantity" is a positive number of shares (fractions allowed). Watchlist "action" is "add" or "remove". Tickers are uppercase.
- Trades that cannot be filled (insufficient cash or shares) are rejected by the system and reported to the user, so do not claim certainty of success beyond "I've submitted".
- ALWAYS respond with valid JSON matching this schema and nothing else:
  {"message": string, "trades": [{"ticker": string, "side": "buy"|"sell", "quantity": number}], "watchlist_changes": [{"ticker": string, "action": "add"|"remove"}]}
  Use empty arrays when there are no trades or watchlist changes."""


def _describe_actions(actions: dict | None) -> str:
    """Summarise executed actions so the model sees the real outcomes of earlier turns."""
    if not actions:
        return ""
    parts = []
    for t in actions.get("trades") or []:
        outcome = (
            "ok" if t.get("status") == "executed" else f"FAILED: {t.get('error', 'unknown error')}"
        )
        parts.append(f"{t.get('side')} {t.get('quantity')} {t.get('ticker')} [{outcome}]")
    for w in actions.get("watchlist_changes") or []:
        outcome = (
            "ok" if w.get("status") == "executed" else f"FAILED: {w.get('error', 'unknown error')}"
        )
        parts.append(f"watchlist {w.get('action')} {w.get('ticker')} [{outcome}]")
    return f"\n[System note - actions performed: {'; '.join(parts)}]" if parts else ""


def build_messages(user_message: str, portfolio: dict | None, history: list[dict]) -> list[dict]:
    """Assemble system prompt, portfolio context, recent history and the new user message."""
    if portfolio is None:
        context = "Portfolio data is currently unavailable."
    else:
        context = "Current portfolio state (live):\n" + json.dumps(portfolio, default=str)
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]
    for msg in history:
        if msg.get("role") not in ("user", "assistant"):
            continue
        content = msg.get("content") or ""
        if msg["role"] == "assistant":
            content += _describe_actions(msg.get("actions"))
        messages.append({"role": msg["role"], "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages
