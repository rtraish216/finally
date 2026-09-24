import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { makeTerminal, withTerminal } from "@/test/fixtures";

function mockFetch(routes: Record<string, () => unknown | Promise<unknown>>, status = 200) {
  const fn = vi.fn(async (url: string) => {
    const handler = routes[url];
    if (!handler) return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
    const body = await handler();
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

const history = {
  messages: [
    { role: "user", content: "Buy 5 AAPL", actions: null, created_at: "2026-09-21T10:00:00Z" },
    {
      role: "assistant",
      content: "Done.",
      actions: {
        trades: [
          { ticker: "AAPL", side: "buy", quantity: 5, price: 190.5, status: "executed" },
          { ticker: "NVDA", side: "sell", quantity: 3, status: "failed", error: "Insufficient shares" },
        ],
        watchlist_changes: [{ ticker: "PYPL", action: "add", status: "executed" }],
      },
      created_at: "2026-09-21T10:00:01Z",
    },
  ],
};

describe("ChatPanel", () => {
  it("loads history and renders inline trade and watchlist confirmations", async () => {
    mockFetch({ "/api/chat/history": () => history });
    render(withTerminal(makeTerminal(), <ChatPanel />));
    const msgs = await screen.findAllByTestId("chat-message");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toHaveAttribute("data-role", "user");
    expect(msgs[1]).toHaveAttribute("data-role", "assistant");
    const actions = screen.getAllByTestId("chat-action");
    expect(actions).toHaveLength(3);
    expect(actions[0]).toHaveTextContent("Bought 5 AAPL at 190.50");
    expect(actions[0]).toHaveAttribute("data-status", "executed");
    expect(actions[1]).toHaveTextContent("Sell 3 NVDA failed: Insufficient shares");
    expect(actions[1]).toHaveAttribute("data-status", "failed");
    expect(actions[2]).toHaveTextContent("Added PYPL to watchlist");
  });

  it("shows a loading indicator while waiting, then the reply, and refreshes state after actions", async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => (resolve = r));
    mockFetch({
      "/api/chat/history": () => ({ messages: [] }),
      "/api/chat": () => pending,
    });
    const refreshAll = vi.fn().mockResolvedValue(undefined);
    render(withTerminal(makeTerminal({ refreshAll }), <ChatPanel />));
    await userEvent.type(screen.getByTestId("chat-input"), "Buy 5 AAPL");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(await screen.findByTestId("chat-loading")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toHaveValue("");
    expect(screen.getByTestId("chat-send")).toBeDisabled();

    resolve({
      message: "Bought 5 AAPL.",
      trades: [{ ticker: "AAPL", side: "buy", quantity: 5, price: 190.5, status: "executed" }],
      watchlist_changes: [],
    });
    await waitFor(() => expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument());
    const msgs = screen.getAllByTestId("chat-message");
    expect(msgs[msgs.length - 1]).toHaveTextContent("Bought 5 AAPL.");
    expect(screen.getByTestId("chat-action")).toHaveTextContent("Bought 5 AAPL at 190.50");
    expect(refreshAll).toHaveBeenCalled();
  });

  it("shows an error when the request fails", async () => {
    const fn = vi.fn(async (url: string) =>
      url === "/api/chat/history"
        ? new Response(JSON.stringify({ messages: [] }))
        : new Response(JSON.stringify({ detail: "OPENROUTER_API_KEY is not set" }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fn);
    render(withTerminal(makeTerminal(), <ChatPanel />));
    await userEvent.type(screen.getByTestId("chat-input"), "hi");
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(await screen.findByTestId("chat-error")).toHaveTextContent("OPENROUTER_API_KEY is not set");
  });

  it("collapses and expands", async () => {
    mockFetch({ "/api/chat/history": () => ({ messages: [] }) });
    render(withTerminal(makeTerminal(), <ChatPanel />));
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "true");
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("chat-input")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });

  it("ignores empty messages", async () => {
    const fn = mockFetch({ "/api/chat/history": () => ({ messages: [] }) });
    render(withTerminal(makeTerminal(), <ChatPanel />));
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    await userEvent.type(screen.getByTestId("chat-input"), "   ");
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    expect(fn).toHaveBeenCalledTimes(1); // history only
  });
});
