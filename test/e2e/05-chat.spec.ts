import { test, expect } from "@playwright/test";
import { getPortfolio, getWatchlistTickers, resetState } from "../helpers/api";
import { MOCK } from "../helpers/mock-llm";
import { openApp, tid } from "../helpers/ui";

// Requires LLM_MOCK=true on the backend.

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

const messages = (page: any) => page.getByTestId(tid.chatMessage);

// Chat history persists in the database, so earlier tests' messages are still on screen.
// Wait for the count to settle, then send and wait for exactly one user + one assistant message more.
async function submit(page: any, text: string) {
  await page.getByTestId(tid.chatInput).fill(text);
  await page.getByTestId(tid.chatSend).click();
}

async function send(page: any, text: string) {
  let base = -1;
  await expect
    .poll(async () => {
      const n = await messages(page).count();
      const settled = n === base;
      base = n;
      return settled;
    }, { intervals: [500], timeout: 10_000 })
    .toBe(true);
  await submit(page, text);
  await expect(messages(page)).toHaveCount(base + 2);
}

test("send a message and receive an assistant reply", async ({ page }) => {
  await openApp(page);
  await send(page, MOCK.plain);
  await expect(page.locator(`[data-testid="${tid.chatMessage}"][data-role="user"]`).last()).toContainText(MOCK.plain);
  await expect(page.locator(`[data-testid="${tid.chatMessage}"][data-role="assistant"]`).last()).toContainText(/Mock FinAlly/);
  await expect(page.getByTestId(tid.chatLoading)).toHaveCount(0);
});

test("chat-executed buy is shown inline and updates the portfolio", async ({ page, request }) => {
  await openApp(page);
  await send(page, MOCK.buy(5, "AAPL"));

  const action = page.locator(`[data-testid="${tid.chatAction}"][data-kind="trade"]`).last();
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("data-status", "executed");
  await expect(action).toContainText(/AAPL/);
  await expect(action).toContainText(/bought|buy/i);

  await expect(page.getByTestId(tid.positionRow("AAPL"))).toBeVisible();
  expect((await getPortfolio(request)).positions[0]).toMatchObject({ ticker: "AAPL", quantity: 5 });
});

test("chat trade that fails is shown as failed and nothing changes", async ({ page, request }) => {
  await openApp(page);
  await send(page, MOCK.sell(9999, "AAPL"));

  const action = page.locator(`[data-testid="${tid.chatAction}"][data-kind="trade"]`).last();
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("data-status", "failed");
  expect((await getPortfolio(request)).positions).toEqual([]);
});

test("chat watchlist add is shown inline and the ticker appears", async ({ page, request }) => {
  await openApp(page);
  await send(page, MOCK.addWatch("PYPL"));
  await expect(page.locator(`[data-testid="${tid.chatAction}"][data-kind="watchlist"]`).last()).toContainText(/PYPL/);
  await expect(page.getByTestId(tid.watchRow("PYPL"))).toBeVisible();
  expect(await getWatchlistTickers(request)).toContain("PYPL");
});

test("chat history survives a page reload", async ({ page }) => {
  await openApp(page);
  await send(page, MOCK.plain);
  await expect(page.locator(`[data-testid="${tid.chatMessage}"][data-role="assistant"]`).last()).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-testid="${tid.chatMessage}"][data-role="user"]`).last()).toContainText(MOCK.plain);
});

test("shows a loading indicator while waiting for the response", async ({ page }) => {
  await openApp(page);
  // Delay the API response so the loading state is observable.
  await page.route("**/api/chat", async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await submit(page, MOCK.plain);
  await expect(page.getByTestId(tid.chatLoading)).toBeVisible();
  await expect(page.getByTestId(tid.chatLoading)).toHaveCount(0, { timeout: 10_000 });
});
