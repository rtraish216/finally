import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PositionsTable } from "./PositionsTable";
import { makeTerminal, withTerminal } from "@/test/fixtures";

describe("PositionsTable", () => {
  it("renders a row per position with live P&L", () => {
    render(withTerminal(makeTerminal(), <PositionsTable />));
    expect(screen.getAllByTestId(/^position-row-/)).toHaveLength(2);
    expect(screen.getByTestId("position-qty-AAPL")).toHaveTextContent("10");
    expect(screen.getByTestId("position-avg-AAPL")).toHaveTextContent("190.00");
    expect(screen.getByTestId("position-price-AAPL")).toHaveTextContent("200.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveTextContent("+100.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveClass("text-up");
    expect(screen.getByTestId("position-pct-AAPL")).toHaveTextContent("+5.26%");
    expect(screen.getByTestId("position-pnl-GOOGL")).toHaveTextContent("-50.00");
    expect(screen.getByTestId("position-pnl-GOOGL")).toHaveClass("text-down");
  });

  it("shows an empty state with no positions", () => {
    render(withTerminal(makeTerminal({ portfolio: { cash_balance: 10000, total_value: 10000, unrealized_pnl: 0, positions: [] } }), <PositionsTable />));
    expect(screen.getByText(/no open positions/i)).toBeInTheDocument();
  });
});
