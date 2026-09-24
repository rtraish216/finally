import { test, expect } from "@playwright/test";
import { getWatchlistTickers, resetState } from "../helpers/api";
import { openApp, tid } from "../helpers/ui";

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

test("add a ticker to the watchlist and see it stream", async ({ page, request }) => {
  await openApp(page);
  await page.getByTestId(tid.watchAddInput).fill("PYPL");
  await page.getByTestId(tid.watchAddButton).click();

  await expect(page.getByTestId(tid.watchRow("PYPL"))).toBeVisible();
  await expect(page.getByTestId(tid.watchPrice("PYPL"))).toHaveText(/\d+\.\d{2}/);
  expect(await getWatchlistTickers(request)).toContain("PYPL");
});

test("remove a ticker from the watchlist", async ({ page, request }) => {
  await openApp(page);
  await expect(page.getByTestId(tid.watchRow("NFLX"))).toBeVisible();
  // The remove control may only appear on hover.
  await page.getByTestId(tid.watchRow("NFLX")).hover();
  await page.getByTestId(tid.watchRemove("NFLX")).click();

  await expect(page.getByTestId(tid.watchRow("NFLX"))).toHaveCount(0);
  expect(await getWatchlistTickers(request)).not.toContain("NFLX");
});

test("watchlist changes persist across a page reload", async ({ page }) => {
  await openApp(page);
  await page.getByTestId(tid.watchAddInput).fill("PYPL");
  await page.getByTestId(tid.watchAddButton).click();
  await expect(page.getByTestId(tid.watchRow("PYPL"))).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(tid.watchRow("PYPL"))).toBeVisible();
});

test("adding an existing ticker does not create a duplicate row", async ({ page }) => {
  await openApp(page);
  await page.getByTestId(tid.watchAddInput).fill("aapl");
  await page.getByTestId(tid.watchAddButton).click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId(tid.watchRow("AAPL"))).toHaveCount(1);
});
