import { APIRequestContext, expect } from "@playwright/test";

export const DEFAULT_TICKERS = [
  "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX",
];

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  unrealized_pnl: number;
  positions: Position[];
}

export async function getPortfolio(request: APIRequestContext): Promise<Portfolio> {
  const res = await request.get("/api/portfolio");
  expect(res.status()).toBe(200);
  return res.json();
}

export async function getWatchlistTickers(request: APIRequestContext): Promise<string[]> {
  const res = await request.get("/api/watchlist");
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.watchlist.map((w: { ticker: string }) => w.ticker);
}

export async function trade(
  request: APIRequestContext,
  ticker: string,
  side: "buy" | "sell",
  quantity: number,
) {
  return request.post("/api/portfolio/trade", { data: { ticker, side, quantity } });
}

/**
 * The database persists between tests and there is no reset endpoint, so tests
 * put the app back into a known shape with compensating actions: sell every
 * position and restore the default 10-ticker watchlist. (Cash cannot be reset
 * exactly, so tests assert on deltas, never absolute cash.)
 */
export async function resetState(request: APIRequestContext): Promise<void> {
  const portfolio = await getPortfolio(request);
  for (const p of portfolio.positions) {
    const res = await trade(request, p.ticker, "sell", p.quantity);
    expect(res.status(), `sell ${p.ticker} during reset`).toBe(200);
  }
  const current = await getWatchlistTickers(request);
  for (const t of current) {
    if (!DEFAULT_TICKERS.includes(t)) {
      await request.delete(`/api/watchlist/${t}`);
    }
  }
  for (const t of DEFAULT_TICKERS) {
    if (!current.includes(t)) {
      await request.post("/api/watchlist", { data: { ticker: t } });
    }
  }
}

/** "$10,000.00" / "-$1.50" / "+1.2%" -> number. */
export function parseNumber(text: string | null): number {
  if (text === null) return NaN;
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  return Number(cleaned);
}
