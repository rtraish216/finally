import { Page, expect } from "@playwright/test";
import { parseNumber } from "./api";

// data-testid names are the contract with frontend/README.md.
export const tid = {
  headerTotal: "portfolio-total",
  headerCash: "cash-balance",
  status: "connection-dot",
  watchRow: (t: string) => `watchlist-row-${t}`,
  watchPrice: (t: string) => `price-${t}`,
  watchChange: (t: string) => `change-${t}`,
  watchRemove: (t: string) => `watchlist-remove-${t}`,
  watchAddInput: "watchlist-add-input",
  watchAddButton: "watchlist-add-button",
  sparkline: (t: string) => `sparkline-${t}`,
  mainChart: "main-chart-ticker",
  tradeTicker: "trade-ticker",
  tradeQty: "trade-quantity",
  tradeBuy: "trade-buy",
  tradeSell: "trade-sell",
  tradeMessage: "trade-feedback",
  positionsTable: "positions",
  positionRow: (t: string) => `position-row-${t}`,
  positionQty: (t: string) => `position-qty-${t}`,
  positionAvgCost: (t: string) => `position-avg-${t}`,
  positionPnl: (t: string) => `position-pnl-${t}`,
  heatmap: "heatmap",
  heatmapCell: (t: string) => `heatmap-cell-${t}`,
  pnlChart: "pnl-chart-plot",
  chatPanel: "chat-panel",
  chatInput: "chat-input",
  chatSend: "chat-send",
  chatLoading: "chat-loading",
  chatMessage: "chat-message",
  chatAction: "chat-action", // data-kind="trade|watchlist", data-status="executed|failed"
};

export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId(tid.status)).toHaveAttribute("data-status", "connected", {
    timeout: 15_000,
  });
}

export async function moneyOf(page: Page, testId: string): Promise<number> {
  return parseNumber(await page.getByTestId(testId).textContent());
}

export async function placeTrade(page: Page, side: "buy" | "sell", ticker: string, qty: number) {
  await page.getByTestId(tid.tradeTicker).fill(ticker);
  await page.getByTestId(tid.tradeQty).fill(String(qty));
  await page.getByTestId(side === "buy" ? tid.tradeBuy : tid.tradeSell).click();
  // The trade bar clears its quantity when a request completes, so wait for the result
  // before the next action (submitting clears feedback; data-ok reappears when done).
  await expect(page.getByTestId(tid.tradeMessage)).toHaveAttribute("data-ok", /true|false/);
}
