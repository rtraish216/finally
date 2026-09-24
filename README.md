# FinAlly — AI Trading Workstation

FinAlly (Finance Ally) is a simulated trading workstation with live streaming prices, a virtual $10,000 portfolio, and an LLM chat assistant that can analyze positions and execute trades on your behalf.

> **Status:** all v1 components are built: market data simulator, SQLite database, FastAPI backend, LLM chat integration, Next.js frontend, Docker packaging and Playwright E2E tests. See `planning/PLAN.md` for the full specification.

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

Prerequisite: Docker (Desktop or Engine).

1. Create a `.env` in the project root (optional; without it the app runs but AI chat is unavailable):

   ```bash
   cp .env.example .env   # then set OPENROUTER_API_KEY
   ```

   - `OPENROUTER_API_KEY` — OpenRouter key for the chat assistant
   - `LLM_MOCK=true` — deterministic mock LLM responses (no key needed)

2. Start the app:

   ```bash
   scripts/start_mac.sh            # macOS/Linux; add --build to force a rebuild, --open to open the browser
   .\scripts\start_windows.ps1     # Windows PowerShell; -Build / -Open
   ```

3. Open http://localhost:8000.

Stop it with `scripts/stop_mac.sh` (or `stop_windows.ps1`). The container is removed but the `finally-data` Docker volume, which holds the SQLite database, is kept. To reset all data: `docker volume rm finally-data`.

Without the scripts:

```bash
docker build -t finally .
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 --env-file .env finally
# or: docker compose up --build
```

### End-to-end tests

```bash
docker compose -f test/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from playwright
docker compose -f test/docker-compose.test.yml down -v
```

Runs the app with `LLM_MOCK=true` and a fresh database, plus a Playwright container.

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
