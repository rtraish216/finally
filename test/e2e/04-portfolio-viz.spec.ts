import { test, expect } from "@playwright/test";
import { resetState } from "../helpers/api";
import { openApp, tid, placeTrade } from "../helpers/ui";

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

test("heatmap renders one cell per position", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "buy", "AAPL", 5);
  await placeTrade(page, "buy", "MSFT", 3);

  await expect(page.getByTestId(tid.heatmap)).toBeVisible();
  await expect(page.getByTestId(tid.heatmapCell("AAPL"))).toBeVisible();
  await expect(page.getByTestId(tid.heatmapCell("MSFT"))).toBeVisible();
  await expect(page.locator('[data-testid^="heatmap-cell-"]')).toHaveCount(2);
});

test("heatmap cell colour reflects P&L sign (green profit, red loss)", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "buy", "TSLA", 10);
  const cell = page.getByTestId(tid.heatmapCell("TSLA"));
  await expect(cell).toBeVisible();

  // Read the P&L and the painted colour from the same DOM snapshot so they cannot race.
  const read = () =>
    cell.evaluate((el) => {
      const shape = el.querySelector("rect,path");
      const fill = shape ? getComputedStyle(shape).fill : "";
      const [r, g] = (fill.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      return { pct: Number(el.getAttribute("data-pnl-pct")), r, g, fill };
    });

  // Prices random-walk; wait until the displayed P&L is non-zero.
  await expect.poll(async () => Math.abs((await read()).pct) > 0, { timeout: 30_000 }).toBe(true);
  const { pct, r, g, fill } = await read();
  expect(r !== undefined, `parsed rgb from "${fill}"`).toBe(true);
  if (pct > 0) expect(g, `profit cell fill ${fill}`).toBeGreaterThan(r);
  else expect(r, `loss cell fill ${fill}`).toBeGreaterThan(g);
});

test("P&L chart has data points after trades", async ({ page, request }) => {
  await openApp(page);
  await placeTrade(page, "buy", "AAPL", 1);
  await expect(page.getByTestId(tid.positionRow("AAPL"))).toBeVisible();
  await placeTrade(page, "sell", "AAPL", 1);
  await expect(page.getByTestId(tid.positionRow("AAPL"))).toHaveCount(0);

  // Each trade records a snapshot immediately.
  const hist = await (await request.get("/api/portfolio/history")).json();
  expect(hist.snapshots.length).toBeGreaterThanOrEqual(2);

  await page.reload();
  const chart = page.getByTestId(tid.pnlChart);
  await expect(chart).toBeVisible();
  await expect
    .poll(async () => Number(await chart.getAttribute("data-points")), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  // Recharts draws the series as an svg path.
  await expect(chart.locator("svg path.recharts-line-curve, svg .recharts-line path").first()).toBeVisible();
});

test("positions table shows quantity, avg cost, current price, P&L", async ({ page }) => {
  await openApp(page);
  await placeTrade(page, "buy", "JPM", 4);
  const row = page.getByTestId(tid.positionRow("JPM"));
  await expect(row).toBeVisible();
  await expect(row).toContainText("JPM");
  await expect(row).toContainText(/\d+\.\d{2}/);
  await expect(page.getByTestId(tid.positionPnl("JPM"))).toHaveText(/[-+]?\$?[\d,]*\.?\d+/);
});
