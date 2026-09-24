import { test, expect } from "@playwright/test";
import { getPortfolio, getWatchlistTickers, resetState } from "../helpers/api";
import { MOCK } from "../helpers/mock-llm";

// Requires the backend to run with LLM_MOCK=true.

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

async function chat(request: any, message: string) {
  const res = await request.post("/api/chat", { data: { message } });
  expect(res.status()).toBe(200);
  return res.json();
}

test("plain message returns text and empty action arrays", async ({ request }) => {
  const body = await chat(request, MOCK.plain);
  expect(typeof body.message).toBe("string");
  expect(body.message.length).toBeGreaterThan(0);
  expect(body.trades).toEqual([]);
  expect(body.watchlist_changes).toEqual([]);
});

test("chat buy executes the trade and reports it", async ({ request }) => {
  const body = await chat(request, MOCK.buy(5, "AAPL"));
  expect(body.trades).toHaveLength(1);
  expect(body.trades[0]).toMatchObject({ ticker: "AAPL", side: "buy", quantity: 5, status: "executed" });
  expect(body.trades[0].price).toBeGreaterThan(0);
  const p = await getPortfolio(request);
  expect(p.positions.find((x) => x.ticker === "AAPL")?.quantity).toBe(5);
});

test("chat trade that fails validation is reported as failed with an error", async ({ request }) => {
  const body = await chat(request, MOCK.sell(9999, "AAPL"));
  expect(body.trades).toHaveLength(1);
  expect(body.trades[0]).toMatchObject({ ticker: "AAPL", side: "sell", status: "failed" });
  expect(typeof body.trades[0].error).toBe("string");
  expect((await getPortfolio(request)).positions).toEqual([]);
});

test("chat watchlist add and remove", async ({ request }) => {
  let body = await chat(request, MOCK.addWatch("PYPL"));
  expect(body.watchlist_changes).toHaveLength(1);
  expect(body.watchlist_changes[0]).toMatchObject({ ticker: "PYPL", action: "add", status: "executed" });
  expect(await getWatchlistTickers(request)).toContain("PYPL");

  body = await chat(request, MOCK.removeWatch("PYPL"));
  expect(body.watchlist_changes).toHaveLength(1);
  expect(body.watchlist_changes[0]).toMatchObject({ ticker: "PYPL", action: "remove", status: "executed" });
  expect(await getWatchlistTickers(request)).not.toContain("PYPL");
});

test("GET /api/chat/history returns messages oldest first with actions", async ({ request }) => {
  await chat(request, MOCK.buy(1, "V"));
  const res = await request.get("/api/chat/history");
  expect(res.status()).toBe(200);
  const { messages } = await res.json();
  expect(messages.length).toBeGreaterThanOrEqual(2);
  const lastTwo = messages.slice(-2);
  expect(lastTwo[0].role).toBe("user");
  expect(lastTwo[0].content).toBe(MOCK.buy(1, "V"));
  expect(lastTwo[0].actions).toBeNull();
  expect(lastTwo[1].role).toBe("assistant");
  expect(lastTwo[1].actions.trades).toHaveLength(1);
  expect(lastTwo[1].actions.watchlist_changes).toEqual([]);
  const times = messages.map((m: any) => Date.parse(m.created_at));
  expect([...times].sort((a, b) => a - b)).toEqual(times);
});

test("chat mock: unsupported ticker on watchlist add is reported as failed", async ({ request }) => {
  const body = await chat(request, "add ZZZZ");
  expect(body.watchlist_changes).toHaveLength(1);
  expect(body.watchlist_changes[0]).toMatchObject({ ticker: "ZZZZ", action: "add", status: "failed" });
  expect(typeof body.watchlist_changes[0].error).toBe("string");
});

test("chat mock: several actions run independently and in order", async ({ request }) => {
  const body = await chat(request, "buy 1 AAPL and sell 9999 NVDA");
  expect(body.trades).toHaveLength(2);
  expect(body.trades[0]).toMatchObject({ ticker: "AAPL", side: "buy", status: "executed" });
  expect(body.trades[1]).toMatchObject({ ticker: "NVDA", side: "sell", status: "failed" });
  const p = await getPortfolio(request);
  expect(p.positions.map((x) => x.ticker)).toEqual(["AAPL"]);
});
