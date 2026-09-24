import type { ReactNode } from "react";
import { Provider, type Terminal } from "@/hooks/TerminalProvider";
import type { Portfolio, PriceMap, PriceTick } from "@/lib/types";

export function tick(ticker: string, price: number, start = price, direction: PriceTick["direction"] = "flat"): PriceTick {
  return { ticker, price, previous_price: price, session_start_price: start, timestamp: 1758400000, direction };
}

export const prices: PriceMap = {
  AAPL: tick("AAPL", 200, 190, "up"),
  GOOGL: tick("GOOGL", 170, 175, "down"),
  MSFT: tick("MSFT", 400, 400),
};

export const portfolio: Portfolio = {
  cash_balance: 8000,
  total_value: 10000,
  unrealized_pnl: 0,
  positions: [
    { ticker: "AAPL", quantity: 10, avg_cost: 190, current_price: 190, market_value: 1900, unrealized_pnl: 0, unrealized_pnl_percent: 0 },
    { ticker: "GOOGL", quantity: 5, avg_cost: 180, current_price: 180, market_value: 900, unrealized_pnl: 0, unrealized_pnl_percent: 0 },
  ],
};

const noop = async () => {};

export function makeTerminal(over: Partial<Terminal> = {}): Terminal {
  return {
    status: "connected",
    prices,
    history: {},
    watchlist: ["AAPL", "GOOGL", "MSFT"],
    portfolio,
    snapshots: [],
    selected: "AAPL",
    select: () => {},
    refreshPortfolio: noop,
    refreshWatchlist: noop,
    refreshHistory: noop,
    refreshAll: noop,
    trade: async (ticker, quantity, side) => ({
      ticker,
      side,
      quantity,
      price: 100,
      executed_at: "2026-09-21T10:00:00Z",
      cash_balance: 0,
    }),
    addTicker: noop,
    removeTicker: noop,
    ...over,
  };
}

export function withTerminal(value: Terminal, children: ReactNode) {
  return <Provider value={value}>{children}</Provider>;
}

/** Minimal controllable EventSource for tests. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  fail(closed = false) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.();
  }
  static reset() {
    FakeEventSource.instances = [];
  }
  static get last() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
}
