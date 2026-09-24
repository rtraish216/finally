import { test, expect } from "@playwright/test";
import { getPortfolio, resetState } from "../helpers/api";
import { openApp, tid, moneyOf, placeTrade } from "../helpers/ui";

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

test("buy shares: cash decreases, position appears, portfolio value stays consistent", async ({ page, request }) => {
  const before = await getPortfolio(request);
  await openApp(page);
  await expect.poll(() => moneyOf(page, tid.headerCash)).toBeCloseTo(before.cash_balance, 1);

  await placeTrade(page, "buy", "AAPL", 10);

  await expect(page.getByTestId(tid.positionRow("AAPL"))).toBeVisible();
  await expect(page.getByTestId(tid.positionQty("AAPL"))).toHaveText(/^10(\.0+)?$/);

  const after = await getPortfolio(request);
  const pos = after.positions.find((p) => p.ticker === "AAPL")!;
  expect(pos.quantity).toBe(10);
  // Cash decreased by exactly qty * fill price.
  expect(before.cash_balance - after.cash_balance).toBeCloseTo(10 * pos.avg_cost, 2);
  await expect.poll(() => moneyOf(page, tid.headerCash)).toBeCloseTo(after.cash_balance, 1);
  // Header total value (cash + streamed positions value) stays close to cash + market value.
  await expect
    .poll(() => moneyOf(page, tid.headerTotal), { timeout: 5000 })
    .toBeGreaterThan(before.cash_balance - 50);
  expect(await page.getByTestId(tid.positionAvgCost("AAPL")).textContent()).toContain(
    pos.avg_cost.toFixed(2),
  );
});

test("buy adds to an existing position", async ({ page, request }) => {
  await openApp(page);
  await placeTrade(page, "buy", "MSFT", 2);
  await expect(page.getByTestId(tid.positionQty("MSFT"))).toHaveText(/^2(\.0+)?$/);
  await placeTrade(page, "buy", "MSFT", 3);
  await expect(page.getByTestId(tid.positionQty("MSFT"))).toHaveText(/^5(\.0+)?$/);
  expect((await getPortfolio(request)).positions).toHaveLength(1);
});

test("partial sell increases cash and reduces the position", async ({ page, request }) => {
  await openApp(page);
  await placeTrade(page, "buy", "GOOGL", 10);
  await expect(page.getByTestId(tid.positionQty("GOOGL"))).toHaveText(/^10(\.0+)?$/);
  const mid = await getPortfolio(request);

  await placeTrade(page, "sell", "GOOGL", 4);
  await expect(page.getByTestId(tid.positionQty("GOOGL"))).toHaveText(/^6(\.0+)?$/);
  const after = await getPortfolio(request);
  expect(after.cash_balance).toBeGreaterThan(mid.cash_balance);
  expect(after.positions[0].quantity).toBe(6);
});

test("selling the whole position removes the row", async ({ page, request }) => {
  await openApp(page);
  await placeTrade(page, "buy", "TSLA", 3);
  await expect(page.getByTestId(tid.positionRow("TSLA"))).toBeVisible();
  await placeTrade(page, "sell", "TSLA", 3);
  await expect(page.getByTestId(tid.positionRow("TSLA"))).toHaveCount(0);
  expect((await getPortfolio(request)).positions).toEqual([]);
});

test("insufficient cash shows an error and changes nothing", async ({ page, request }) => {
  const before = await getPortfolio(request);
  await openApp(page);
  await placeTrade(page, "buy", "NVDA", 100000);
  await expect(page.getByTestId(tid.tradeMessage)).toContainText(/insufficient|cash|afford|enough/i);
  await expect(page.getByTestId(tid.positionRow("NVDA"))).toHaveCount(0);
  expect((await getPortfolio(request)).cash_balance).toBeCloseTo(before.cash_balance, 6);
});

test("selling shares you do not own shows an error", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "sell", "META", 1);
  await expect(page.getByTestId(tid.tradeMessage)).toContainText(/insufficient|shares|own|position|enough/i);
  await expect(page.getByTestId(tid.positionRow("META"))).toHaveCount(0);
});

test("positions persist across a page reload", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "buy", "V", 2);
  await expect(page.getByTestId(tid.positionRow("V"))).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(tid.positionRow("V"))).toBeVisible();
  await expect(page.getByTestId(tid.positionQty("V"))).toHaveText(/^2(\.0+)?$/);
});
