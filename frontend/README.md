# FinAlly frontend

Next.js (App Router) + TypeScript + Tailwind v4 + Recharts. Built as a **static export** and served same-origin by FastAPI. All API calls use relative `/api/*` URLs; prices come from the native `EventSource` on `/api/stream/prices`. The contract is `planning/API.md`.

## Commands

| Command | What it does |
|---|---|
| `npm ci` (or `npm install`) | Install dependencies |
| `npm run build` | Static export to `frontend/out/` (runs `next build --webpack`) |
| `npm test` | Vitest + React Testing Library (unit + in-memory-backend integration test) |
| `npm run lint` | Type-check (`tsc --noEmit`) |
| `npm run dev` | Dev server on :3000; `/api/*` is proxied to `http://localhost:8000` (override with `BACKEND_URL`). Dev only: the proxy is not part of the export |

Docker: build in a Node 20+ stage with `npm ci && npm run build`, then copy `frontend/out/` to the Python image's `static/` directory. `out/index.html` is the single page; assets are under `out/_next/`.

## Layout

Header (portfolio value, unrealized P&L, cash, connection dot) / watchlist (left) / main chart, heatmap + P&L chart, positions + trade bar (centre) / collapsible AI chat (right).

Portfolio value in the header is computed in the browser: `cash + sum(quantity * latest streamed price)`. Position P&L uses the same live prices. `GET /api/portfolio` and `/api/portfolio/history` are refetched after every trade or chat action that changes something; history is also polled every 30s.

## `data-testid` reference

Ticker-specific ids use the uppercase ticker, e.g. `price-AAPL`.

### Header
| testid | Element |
|---|---|
| `portfolio-total` | Live total value text (`data-value` = raw number) |
| `portfolio-pnl` | Unrealized P&L text |
| `cash-balance` | Cash text (`data-value` = raw number) |
| `connection-dot` | Status dot; `data-status` = `connected` (green) / `reconnecting` (yellow) / `disconnected` (red) |
| `connection-label` | "Live" / "Reconnecting" / "Disconnected" |

### Watchlist
| testid | Element |
|---|---|
| `watchlist` | Panel |
| `watchlist-row-{T}` | Row; `data-selected="true"` when charted; click to select |
| `price-{T}` | Price cell; `data-price` raw number; `data-flash` = `flash-up`/`flash-down` briefly (~120ms) after a change, then fades over 500ms |
| `change-{T}` | Daily change % text (e.g. `+0.15%`) |
| `sparkline-{T}` | Sparkline wrapper; `data-points` = number of accumulated ticks |
| `watchlist-remove-{T}` | Remove button (visible on row hover; clickable regardless) |
| `watchlist-add-input` / `watchlist-add-button` | Add-ticker form |
| `watchlist-error` | Error text after a failed add/remove (e.g. unknown ticker) |

### Charts
| testid | Element |
|---|---|
| `main-chart` | Main chart panel |
| `main-chart-ticker` | Wrapper; `data-ticker` = selected ticker, `data-points` = ticks so far |
| `main-chart-price` | Selected ticker price |
| `heatmap` | Heatmap panel |
| `heatmap-chart` | Treemap wrapper (only when positions exist); `data-cells` = position count |
| `heatmap-cell-{T}` | Treemap cell; `data-pnl-pct`, `data-fill` (colour) |
| `pnl-chart` | P&L panel |
| `pnl-chart-plot` | Plot wrapper (only when snapshots exist); `data-points` = snapshot count |

### Positions and trading
| testid | Element |
|---|---|
| `positions` | Panel |
| `position-row-{T}` | Row (absent once the position is sold) |
| `position-qty-{T}`, `position-avg-{T}`, `position-price-{T}`, `position-pnl-{T}`, `position-pct-{T}` | Cells |
| `trade-ticker`, `trade-quantity` | Inputs (ticker is pre-filled from the selected watchlist row) |
| `trade-buy`, `trade-sell` | Buttons (no confirmation dialog) |
| `trade-feedback` | Result line; `data-ok` = `true`/`false`; text like `Bought 10 AAPL at 190.50` or the backend error detail |

### AI chat
| testid | Element |
|---|---|
| `chat-panel` | Panel; `data-open` = `true`/`false` |
| `chat-toggle` | Collapse / expand button |
| `chat-messages` | Scroll container |
| `chat-message` | One message; `data-role` = `user`/`assistant` |
| `chat-actions` / `chat-action` | Inline actions under an assistant message; `chat-action` has `data-kind` = `trade`/`watchlist` and `data-status` = `executed`/`failed` |
| `chat-input`, `chat-send` | Message input and send button |
| `chat-loading` | Loading indicator while waiting for the LLM |
| `chat-error` | Request failure (e.g. HTTP error) |
| `chat-empty` | Hint shown when there is no history |

## Behaviours tests can rely on

- Values render as formatted text: `$10,000.00` (header total and cash), `190.50` (prices), `+0.15%` (changes), `+20.50` (P&L). Raw numbers are in `data-value` (`portfolio-total`, `cash-balance`) and `data-price` (`price-{T}`).
- Connection dot: `reconnecting` while the browser retries, `disconnected` if that lasts over 8s or the browser gives up (readyState CLOSED, e.g. non-200 response); in the latter case a new `EventSource` is opened with backoff (2s, 4s ... 15s), and the dot returns to `connected` on the first event.

## Notes

- The build script uses `--webpack` so it works in sandboxes that forbid the local port binding Turbopack's PostCSS worker needs. It is otherwise equivalent.
- Charts render nothing in jsdom (zero-size containers); tests assert on the wrappers' `data-*` attributes instead.
