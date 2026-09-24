import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "./Header";
import { makeTerminal, prices, tick, withTerminal } from "@/test/fixtures";

describe("Header", () => {
  it("shows live portfolio total and cash computed from streamed prices", () => {
    render(withTerminal(makeTerminal(), <Header />));
    // cash 8000 + AAPL 10*200 + GOOGL 5*170 = 10850
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("$10,850.00");
    expect(screen.getByTestId("cash-balance")).toHaveTextContent("$8,000.00");
    expect(screen.getByTestId("portfolio-pnl")).toHaveTextContent("+50.00");
  });

  it("recomputes the total when prices move", () => {
    const moved = { ...prices, AAPL: tick("AAPL", 210, 190, "up") };
    render(withTerminal(makeTerminal({ prices: moved }), <Header />));
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("$10,950.00");
  });

  it.each([
    ["connected", "bg-up"],
    ["reconnecting", "bg-accent"],
    ["disconnected", "bg-down"],
  ] as const)("connection dot is %s", (status, cls) => {
    render(withTerminal(makeTerminal({ status }), <Header />));
    const dot = screen.getByTestId("connection-dot");
    expect(dot).toHaveAttribute("data-status", status);
    expect(dot).toHaveClass(cls);
  });

  it("shows placeholders before the portfolio loads", () => {
    render(withTerminal(makeTerminal({ portfolio: null }), <Header />));
    expect(screen.getByTestId("portfolio-total")).toHaveTextContent("--");
  });
});
