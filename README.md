# FinAlly — AI Trading Workstation

FinAlly (Finance Ally) is a simulated trading workstation with live streaming prices, a virtual $10,000 portfolio, and an LLM chat assistant that can analyze positions and execute trades on your behalf.

> **Status:** the market data component (price simulator) is complete. The API, database, LLM integration, and frontend are still to be built. See `planning/PLAN.md` for the full specification.

## Features

- Live-updating watchlist (10 default tickers) with price flashes and sparklines
- Market-order trading, no fees, instant fills
- Portfolio heatmap, P&L chart, and positions table
- AI chat assistant that can trade and manage the watchlist via natural language
- Dark, terminal-style UI

## Architecture

Single Docker container on port 8000:

- **Frontend:** Next.js (TypeScript), static export served by FastAPI
- **Backend:** FastAPI (Python, managed with `uv`)
- **Database:** SQLite at `db/finally.db`, volume-mounted
- **Streaming:** Server-Sent Events at `/api/stream/prices`
- **Market data:** built-in GBM simulator
- **LLM:** LiteLLM → OpenRouter (Cerebras inference)

## Getting Started

Create a `.env` in the project root:

```bash
OPENROUTER_API_KEY=your-openrouter-api-key-here
LLM_MOCK=false   # set to "true" for deterministic mock LLM responses
```

Once the app is built, run it with Docker:

```bash
docker build -t finally .
docker run -v finally-data:/app/db -p 8000:8000 --env-file .env finally
```

Then open http://localhost:8000. Start/stop scripts will live in `scripts/`.

## Project Layout

```
frontend/   Next.js app
backend/    FastAPI uv project (market data, API, DB, LLM)
planning/   Specification and agent reference docs (PLAN.md, API.md)
scripts/    Docker start/stop scripts
test/       Playwright E2E tests
db/         Runtime SQLite volume mount
```

## Documentation

- `planning/PLAN.md` — project specification
- `planning/API.md` — REST and SSE API contract
- `planning/MARKET_DATA_SUMMARY.md` — market data component summary
