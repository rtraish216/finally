import { test, expect } from "@playwright/test";
import { DEFAULT_TICKERS, getWatchlistTickers, resetState } from "../helpers/api";

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

test("GET /api/watchlist returns the 10 default tickers with prices", async ({ request }) => {
  const res = await request.get("/api/watchlist");
  expect(res.status()).toBe(200);
  const { watchlist } = await res.json();
  expect(watchlist.map((w: any) => w.ticker).sort()).toEqual([...DEFAULT_TICKERS].sort());
  for (const w of watchlist) {
    expect(w.price).toBeGreaterThan(0);
    expect(w.previous_price).toBeGreaterThan(0);
    expect(w.session_start_price).toBeGreaterThan(0);
  }
});

test("POST /api/watchlist adds a ticker; duplicate add is a no-op success", async ({ request }) => {
  let res = await request.post("/api/watchlist", { data: { ticker: "PYPL" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ticker: "PYPL" });
  expect(await getWatchlistTickers(request)).toContain("PYPL");

  res = await request.post("/api/watchlist", { data: { ticker: "PYPL" } });
  expect(res.status()).toBe(200);
  const tickers = await getWatchlistTickers(request);
  expect(tickers.filter((t) => t === "PYPL")).toHaveLength(1);
});

test("POST /api/watchlist normalises lowercase tickers", async ({ request }) => {
  const res = await request.post("/api/watchlist", { data: { ticker: "pypl" } });
  expect(res.status()).toBe(200);
  expect(await getWatchlistTickers(request)).toContain("PYPL");
});

test("POST /api/watchlist rejects a malformed ticker with 400 or 404 and a detail", async ({ request }) => {
  const res = await request.post("/api/watchlist", { data: { ticker: "!!bad ticker!!" } });
  expect([400, 404]).toContain(res.status());
  const body = await res.json();
  expect(typeof body.detail).toBe("string");
});

test("DELETE /api/watchlist/{ticker} removes a ticker", async ({ request }) => {
  const res = await request.delete("/api/watchlist/NFLX");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ticker: "NFLX" });
  expect(await getWatchlistTickers(request)).not.toContain("NFLX");
});

test("a held ticker keeps streaming after removal from the watchlist", async ({ request, baseURL }) => {
  const buy = await request.post("/api/portfolio/trade", { data: { ticker: "V", side: "buy", quantity: 1 } });
  expect(buy.status()).toBe(200);
  expect((await request.delete("/api/watchlist/V")).status()).toBe(200);

  const controller = new AbortController();
  const res = await fetch(`${baseURL}/api/stream/prices`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: Record<string, unknown> | null = null;
  const deadline = Date.now() + 8000;
  while (!event && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const idx = buffer.indexOf("\n\n");
    if (idx >= 0) {
      const line = buffer.slice(0, idx).split("\n").find((l) => l.startsWith("data:"));
      if (line) event = JSON.parse(line.slice(5).trim());
      buffer = buffer.slice(idx + 2);
    }
  }
  controller.abort();
  expect(event, "received an SSE event").not.toBeNull();
  expect(event).toHaveProperty("V");
});

test("POST /api/watchlist with an unsupported ticker returns 404", async ({ request }) => {
  const res = await request.post("/api/watchlist", { data: { ticker: "ZZZZ" } });
  expect(res.status()).toBe(404);
  expect(typeof (await res.json()).detail).toBe("string");
  expect(await getWatchlistTickers(request)).not.toContain("ZZZZ");
});
