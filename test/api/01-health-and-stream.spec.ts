import { test, expect } from "@playwright/test";
import { DEFAULT_TICKERS } from "../helpers/api";

test("GET /api/health returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("GET /api/stream/prices streams SSE events for all default tickers", async ({ baseURL }) => {
  const controller = new AbortController();
  const res = await fetch(`${baseURL}/api/stream/prices`, {
    signal: controller.signal,
    headers: { Accept: "text/event-stream" },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, any>[] = [];
  let buffer = "";
  const deadline = Date.now() + 8000;
  while (events.length < 3 && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (line) events.push(JSON.parse(line.slice(5).trim()));
    }
  }
  controller.abort();

  expect(events.length, "received at least 3 SSE events in 8s").toBeGreaterThanOrEqual(3);
  const first = events[0];
  for (const t of DEFAULT_TICKERS) {
    expect(first, `event contains ${t}`).toHaveProperty(t);
    const u = first[t];
    expect(u.ticker).toBe(t);
    expect(u.price).toBeGreaterThan(0);
    expect(typeof u.previous_price).toBe("number");
    expect(u.session_start_price).toBeGreaterThan(0);
    expect(typeof u.timestamp).toBe("number");
    expect(["up", "down", "flat"]).toContain(u.direction);
  }
  // Prices actually move across events.
  const changed = DEFAULT_TICKERS.some((t) => events[0][t].price !== events[events.length - 1][t].price);
  expect(changed, "at least one price changed between events").toBe(true);
});
