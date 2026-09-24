import { test, expect, Page } from "@playwright/test";
import { FlakyProxy } from "../helpers/proxy";
import { tid } from "../helpers/ui";

const dot = (page: Page) => page.getByTestId(tid.status);

test("status dot is green when the stream is connected", async ({ page }) => {
  await page.goto("/");
  await expect(dot(page)).toHaveAttribute("data-status", "connected", { timeout: 15_000 });
  await expect(page.getByTestId("connection-label")).toHaveText(/live/i);
});

test("dropping the stream: yellow while reconnecting, red after ~8s, green again on recovery", async ({
  page,
  baseURL,
}) => {
  // The browser reaches the app through a proxy we can cut, so the drop is a real network failure.
  const proxy = new FlakyProxy(baseURL!);
  const url = await proxy.start();
  try {
    await page.goto(url + "/");
    await expect(dot(page)).toHaveAttribute("data-status", "connected", { timeout: 15_000 });
    const before = await page.getByTestId(tid.watchPrice("AAPL")).textContent();

    proxy.sever();

    // Yellow: EventSource is retrying.
    await expect(dot(page)).toHaveAttribute("data-status", "reconnecting", { timeout: 10_000 });
    // Red: reconnecting has lasted more than 8 seconds.
    await expect(dot(page)).toHaveAttribute("data-status", "disconnected", { timeout: 20_000 });

    // Heal the path; the client must recover on its own and prices flow again.
    proxy.heal();
    await expect(dot(page)).toHaveAttribute("data-status", "connected", { timeout: 30_000 });
    await expect
      .poll(async () => page.getByTestId(tid.watchPrice("AAPL")).textContent(), { timeout: 15_000 })
      .not.toBe(before);
  } finally {
    await proxy.stop();
  }
});
