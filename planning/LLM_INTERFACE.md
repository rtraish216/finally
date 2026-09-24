# LLM Interface

Package: `backend/app/llm/` (owned by llm-engineer). Tests: `backend/tests/llm/`.

## Entry point

```python
from app.llm import handle_chat
result = await handle_chat(message: str) -> dict
```

Returns exactly the `POST /api/chat` response in `planning/API.md`:
`{"message", "trades": [...], "watchlist_changes": [...]}`.

- Trade entry: `{"ticker","side","quantity","price","status":"executed"}` or `{"ticker","side","quantity","status":"failed","error"}`.
- Watchlist entry: `{"ticker","action","status":"executed"}` or `{..., "status":"failed","error"}`.
- `handle_chat` persists both the user message and the assistant reply (with `actions`) itself via `app.db.add_chat_message`; the route must not persist. History shown to the LLM is the last 20 `chat_messages` (loaded before the new user message is saved).
- It never raises for LLM problems. Each of these returns a friendly `message` with empty action arrays: missing/placeholder `OPENROUTER_API_KEY` (unless `LLM_MOCK=true`), LLM error/timeout (45s), empty output, and output that doesn't match the schema (then `message` is the raw text, per API.md).
- Flow: portfolio context (`app.services.get_portfolio_context`) + history -> prompt -> LiteLLM (`openrouter/openai/gpt-oss-120b`, Cerebras provider, structured output `LLMResponse`) -> parse -> execute each trade in order via `app.services.execute_trade` (independent; failures don't stop the rest) -> watchlist changes via `add_to_watchlist`/`remove_from_watchlist` -> persist -> return. Invalid side / non-positive quantity / empty ticker are rejected as failed without calling the service.
- Structured output schema: `{"message": str, "trades": [{"ticker","side","quantity"}], "watchlist_changes": [{"ticker","action"}]}`; lists may be omitted/null when parsing.
- `OPENROUTER_API_KEY` and `LLM_MOCK` are read from the process environment, falling back to the project-root `.env`.

## Mock mode (`LLM_MOCK=true`)

No network and no API key needed; the mock output goes through the same parse/execute/persist path as a real response, so trades really execute against the services. Trigger phrases (case-insensitive) in the user message:

| Message contains | Result |
|---|---|
| `buy` or `sell` alone | that side of 1 AAPL |
| `buy [N] [shares of] TICKER`, `sell [N] [shares of] TICKER` | trade (N defaults to 1; fractions ok) |
| `sell 9999 AAPL` | failing trade (insufficient shares when fewer are held) |
| `add TICKER` / `remove TICKER` | watchlist add / remove (`add ZZZZ` -> failed, unknown ticker) |
| several phrases, e.g. `buy 1 AAPL and sell 9999 NVDA` | one action each, in order |
| anything else | plain reply, no actions |

Reply text is fixed: `Mock FinAlly: executing your request.` when there are actions, otherwise `Mock FinAlly: I'm your AI trading assistant. Ask me about your portfolio.`

## Testing

`cd backend && uv run --extra dev pytest tests/llm`. Unit tests inject fakes through `ChatDeps` (`handle_chat(message, deps)`); no real network calls.
