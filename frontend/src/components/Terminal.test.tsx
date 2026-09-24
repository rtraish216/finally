import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "./Terminal";
import { FakeEventSource, tick } from "@/test/fixtures";

/** Tiny in-memory backend implementing planning/API.md, wired in through fetch. */
function installBackend() {
  const state = {
    cash: 10000,
    watchlist: ["AAPL", "GOOGL"],
    positions: {} as Record<string, { quantity: number; avg_cost: number }>,
    price: { AAPL: 200, GOOGL: 170, PYPL: 60 } as Record<string, number>,
  };
  const portfolio = () => {
    const positions = Object.entries(state.positions).map(([ticker, p]) => {
      const cur = state.price[ticker];
      return {
        ticker,
        quantity: p.quantity,
        avg_cost: p.avg_cost,
        current_price: cur,
        market_value: p.quantity * cur,
        unrealized_pnl: p.quantity * (cur - p.avg_cost),
        unrealized_pnl_percent: ((cur - p.avg_cost) / p.avg_cost) * 100,
      };
    });
    const total = state.cash + positions.reduce((s, p) => s + p.market_value, 0);
    return { cash_balance: state.cash, total_value: total, unrealized_pnl: 0, positions };
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/watchlist" && method === "GET")
      return json({
        watchlist: state.watchlist.map((t) => ({
          ticker: t,
          price: state.price[t],
          previous_price: state.price[t],
          session_start_price: state.price[t],
        })),
      });
    if (url === "/api/watchlist" && method === "POST") {
      if (!(body.ticker in state.price)) return json({ detail: `Unknown ticker ${body.ticker}` }, 404);
      if (!state.watchlist.includes(body.ticker)) state.watchlist.push(body.ticker);
      return json({ ticker: body.ticker });
    }
    if (url.startsWith("/api/watchlist/") && method === "DELETE") {
      const t = url.split("/").pop()!;
      state.watchlist = state.watchlist.filter((x) => x !== t);
      return json({ ticker: t });
    }
    if (url === "/api/portfolio") return json(portfolio());
    if (url === "/api/portfolio/history") return json({ snapshots: [{ total_value: 10000, recorded_at: "2026-09-21T10:00:00Z" }] });
    if (url === "/api/portfolio/trade") {
      const px = state.price[body.ticker];
      const cost = px * body.quantity;
      if (body.side === "buy") {
        if (cost > state.cash) return json({ detail: "Insufficient cash" }, 400);
        state.cash -= cost;
        state.positions[body.ticker] = { quantity: body.quantity, avg_cost: px };
      } else {
        const held = state.positions[body.ticker]?.quantity ?? 0;
        if (body.quantity > held) return json({ detail: "Insufficient shares" }, 400);
        state.cash += cost;
        if (held === body.quantity) delete state.positions[body.ticker];
        else state.positions[body.ticker].quantity -= body.quantity;
      }
      return json({ ticker: body.ticker, side: body.side, quantity: body.quantity, price: px, executed_at: "x", cash_balance: state.cash });
    }
    if (url === "/api/chat/history") return json({ messages: [] });
    return json({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return state;
}

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe("Terminal (integration against an in-memory backend)", () => {
  it("loads the watchlist, streams prices, trades, and manages the watchlist", async () => {
    installBackend();
    render(<Terminal />);

    // Watchlist and starting cash load from REST
    expect(await screen.findByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("cash-balance")).toHaveTextContent("$10,000.00"));
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("$10,000.00");
    expect(screen.getByTestId("connection-dot")).toHaveAttribute("data-status", "reconnecting");

    // SSE connects and streams
    act(() => FakeEventSource.last.open());
    expect(screen.getByTestId("connection-dot")).toHaveAttribute("data-status", "connected");
    act(() => FakeEventSource.last.emit({ AAPL: tick("AAPL", 201, 200, "up"), GOOGL: tick("GOOGL", 170) }));
    expect(screen.getByTestId("price-AAPL")).toHaveTextContent("201.00");
    expect(screen.getByTestId("sparkline-AAPL")).toHaveAttribute("data-points", "1");

    // Buy 10 AAPL at 200 (backend price), stream says 201
    await userEvent.type(screen.getByTestId("trade-quantity"), "10");
    await userEvent.click(screen.getByTestId("trade-buy"));
    const row = await screen.findByTestId("position-row-AAPL");
    expect(within(row).getByTestId("position-qty-AAPL")).toHaveTextContent("10");
    expect(screen.getByTestId("cash-balance")).toHaveTextContent("$8,000.00");
    // live total = 8000 + 10*201
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("$10,010.00");
    act(() => FakeEventSource.last.emit({ AAPL: tick("AAPL", 205, 200, "up") }));
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("$10,050.00");
    expect(screen.getByTestId("heatmap-chart")).toHaveAttribute("data-cells", "1");

    // Insufficient cash is surfaced
    await userEvent.type(screen.getByTestId("trade-quantity"), "1000");
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(await screen.findByTestId("trade-feedback")).toHaveTextContent("Insufficient cash");

    // Sell all: position disappears
    await userEvent.clear(screen.getByTestId("trade-quantity"));
    await userEvent.type(screen.getByTestId("trade-quantity"), "10");
    await userEvent.click(screen.getByTestId("trade-sell"));
    await waitFor(() => expect(screen.queryByTestId("position-row-AAPL")).not.toBeInTheDocument());

    // Watchlist add / unknown / remove
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByTestId("watchlist-row-PYPL")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "nope");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByTestId("watchlist-error")).toHaveTextContent("Unknown ticker NOPE");
    await userEvent.click(screen.getByTestId("watchlist-remove-PYPL"));
    await waitFor(() => expect(screen.queryByTestId("watchlist-row-PYPL")).not.toBeInTheDocument());
  });
});
