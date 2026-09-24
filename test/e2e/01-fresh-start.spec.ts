import { test, expect } from "@playwright/test";
import { DEFAULT_TICKERS } from "../helpers/api";
import { openApp, tid, moneyOf } from "../helpers/ui";

// Assumes a brand-new database (docker-compose.test.yml creates a fresh volume).
// Set EXPECT_FRESH_DB=false to skip the exact $10,000 assertion on a dirty DB.
const FRESH = process.env.EXPECT_FRESH_DB !== "false";

test("fresh start shows the default watchlist, $10,000 cash and live prices", async ({ page }) => {
  await openApp(page);

  for (const t of DEFAULT_TICKERS) {
    await expect(page.getByTestId(tid.watchRow(t))).toBeVisible();
    await expect(page.getByTestId(tid.watchPrice(t))).toHaveText(/\d+\.\d{2}/);
  }
  await expect(page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(10);

  if (FRESH) {
    await expect.poll(() => moneyOf(page, tid.headerCash)).toBe(10000);
    await expect.poll(() => moneyOf(page, tid.headerTotal)).toBeCloseTo(10000, 0);
  } else {
    await expect.poll(() => moneyOf(page, tid.headerCash)).toBeGreaterThan(0);
  }

  await expect(page.getByTestId(tid.chatPanel)).toBeVisible();
});

test("prices stream: at least one watchlist price changes within 10 seconds", async ({ page }) => {
  await openApp(page);
  const read = () =>
    Promise.all(DEFAULT_TICKERS.map((t) => page.getByTestId(tid.watchPrice(t)).textContent()));
  const initial = await read();
  await expect
    .poll(async () => (await read()).some((v, i) => v !== initial[i]), { timeout: 10_000 })
    .toBe(true);
});

test("sparklines fill in from the stream", async ({ page }) => {
  await openApp(page);
  // Each row has a sparkline; after a few seconds it contains a drawn line.
  await expect(page.getByTestId(tid.sparkline("AAPL"))).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId(tid.sparkline("AAPL")).getAttribute("data-points")), {
      timeout: 10_000,
    })
    .toBeGreaterThan(2);
});

test("price flash: a price change applies a flash class that later fades", async ({ page }) => {
  await openApp(page);
  // Watch for a price cell gaining a flash class / data-flash attribute.
  const sawFlash = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const root = document.body;
        const check = () =>
          Array.from(document.querySelectorAll('[data-testid^="price-"]')).some(
            (el) => el.hasAttribute("data-flash") || /flash/i.test(el.className?.toString() ?? ""),
          );
        if (check()) return resolve(true);
        const obs = new MutationObserver(() => {
          if (check()) {
            obs.disconnect();
            resolve(true);
          }
        });
        obs.observe(root, { subtree: true, attributes: true, attributeFilter: ["class", "data-flash"] });
        setTimeout(() => {
          obs.disconnect();
          resolve(false);
        }, 10_000);
      }),
  );
  expect(sawFlash, "a price cell received a flash class").toBe(true);
});

test("clicking a ticker selects it in the main chart", async ({ page }) => {
  await openApp(page);
  await page.getByTestId(tid.watchRow("NVDA")).click();
  await expect(page.getByTestId(tid.mainChart)).toHaveAttribute("data-ticker", "NVDA");
  await page.getByTestId(tid.watchRow("MSFT")).click();
  await expect(page.getByTestId(tid.mainChart)).toHaveAttribute("data-ticker", "MSFT");
});
