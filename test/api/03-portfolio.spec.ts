import { test, expect } from "@playwright/test";
import { getPortfolio, resetState, trade } from "../helpers/api";

test.beforeEach(async ({ request }) => resetState(request));
test.afterEach(async ({ request }) => resetState(request));

test("GET /api/portfolio has the documented shape", async ({ request }) => {
  const p = await getPortfolio(request);
  expect(typeof p.cash_balance).toBe("number");
  expect(typeof p.total_value).toBe("number");
  expect(typeof p.unrealized_pnl).toBe("number");
  expect(p.positions).toEqual([]);
  expect(p.total_value).toBeCloseTo(p.cash_balance, 2);
});

test("buy fills at the returned price, debits cash, creates a position", async ({ request }) => {
  const before = await getPortfolio(request);
  const res = await trade(request, "AAPL", "buy", 10);
  expect(res.status()).toBe(200);
  const t = await res.json();
  expect(t).toMatchObject({ ticker: "AAPL", side: "buy", quantity: 10 });
  expect(t.price).toBeGreaterThan(0);
  expect(typeof t.executed_at).toBe("string");
  expect(t.cash_balance).toBeCloseTo(before.cash_balance - 10 * t.price, 2);

  const after = await getPortfolio(request);
  expect(after.cash_balance).toBeCloseTo(t.cash_balance, 2);
  expect(after.positions).toHaveLength(1);
  const pos = after.positions[0];
  expect(pos).toMatchObject({ ticker: "AAPL", quantity: 10 });
  expect(pos.avg_cost).toBeCloseTo(t.price, 2);
  expect(pos.market_value).toBeCloseTo(pos.quantity * pos.current_price, 2);
  expect(pos.unrealized_pnl).toBeCloseTo((pos.current_price - pos.avg_cost) * pos.quantity, 2);
  expect(after.total_value).toBeCloseTo(after.cash_balance + pos.market_value, 1);
});

test("fractional quantities are supported", async ({ request }) => {
  const res = await trade(request, "MSFT", "buy", 0.5);
  expect(res.status()).toBe(200);
  const p = await getPortfolio(request);
  expect(p.positions[0].quantity).toBeCloseTo(0.5, 6);
});

test("second buy uses weighted-average cost", async ({ request }) => {
  const a = await (await trade(request, "AAPL", "buy", 4)).json();
  const b = await (await trade(request, "AAPL", "buy", 6)).json();
  const p = await getPortfolio(request);
  expect(p.positions).toHaveLength(1);
  expect(p.positions[0].quantity).toBe(10);
  expect(p.positions[0].avg_cost).toBeCloseTo((4 * a.price + 6 * b.price) / 10, 2);
});

test("partial sell reduces the position and credits cash", async ({ request }) => {
  await trade(request, "GOOGL", "buy", 10);
  const before = await getPortfolio(request);
  const res = await trade(request, "GOOGL", "sell", 4);
  expect(res.status()).toBe(200);
  const t = await res.json();
  const after = await getPortfolio(request);
  expect(after.positions[0].quantity).toBe(6);
  expect(after.cash_balance).toBeCloseTo(before.cash_balance + 4 * t.price, 2);
  // avg cost is unchanged by sells
  expect(after.positions[0].avg_cost).toBeCloseTo(before.positions[0].avg_cost, 4);
});

test("selling the entire position removes it", async ({ request }) => {
  await trade(request, "TSLA", "buy", 3);
  const res = await trade(request, "TSLA", "sell", 3);
  expect(res.status()).toBe(200);
  expect((await getPortfolio(request)).positions).toEqual([]);
});

test("insufficient cash returns 400 with detail and changes nothing", async ({ request }) => {
  const before = await getPortfolio(request);
  const res = await trade(request, "NVDA", "buy", 1_000_000);
  expect(res.status()).toBe(400);
  expect(typeof (await res.json()).detail).toBe("string");
  const after = await getPortfolio(request);
  expect(after.cash_balance).toBeCloseTo(before.cash_balance, 6);
  expect(after.positions).toEqual([]);
});

test("selling shares you do not own returns 400", async ({ request }) => {
  const res = await trade(request, "META", "sell", 1);
  expect(res.status()).toBe(400);
  expect(typeof (await res.json()).detail).toBe("string");
});

test("selling more than owned returns 400 and leaves the position", async ({ request }) => {
  await trade(request, "META", "buy", 2);
  const res = await trade(request, "META", "sell", 3);
  expect(res.status()).toBe(400);
  expect((await getPortfolio(request)).positions[0].quantity).toBe(2);
});

for (const quantity of [0, -5]) {
  test(`quantity ${quantity} is rejected with 400`, async ({ request }) => {
    const res = await trade(request, "AAPL", "buy", quantity);
    expect(res.status()).toBe(400);
    expect(typeof (await res.json()).detail).toBe("string");
  });
}

test("invalid side is rejected with 400 (or 422)", async ({ request }) => {
  const res = await request.post("/api/portfolio/trade", {
    data: { ticker: "AAPL", side: "hold", quantity: 1 },
  });
  expect([400, 422]).toContain(res.status());
});

test("trade on a malformed ticker is rejected", async ({ request }) => {
  const res = await trade(request, "!!!", "buy", 1);
  expect([400, 404]).toContain(res.status());
  expect(typeof (await res.json()).detail).toBe("string");
});

test("GET /api/portfolio/history returns oldest-first snapshots, one added per trade", async ({ request }) => {
  const h0 = await (await request.get("/api/portfolio/history")).json();
  expect(Array.isArray(h0.snapshots)).toBe(true);
  await trade(request, "V", "buy", 1);
  const h1 = await (await request.get("/api/portfolio/history")).json();
  expect(h1.snapshots.length).toBeGreaterThan(h0.snapshots.length);
  const times = h1.snapshots.map((s: any) => Date.parse(s.recorded_at));
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  for (const s of h1.snapshots) {
    expect(typeof s.total_value).toBe("number");
    expect(Number.isNaN(Date.parse(s.recorded_at))).toBe(false);
  }
});

test("trade on an unsupported ticker returns 404", async ({ request }) => {
  const res = await trade(request, "ZZZZ", "buy", 1);
  expect(res.status()).toBe(404);
  expect(typeof (await res.json()).detail).toBe("string");
});
