import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heatmap } from "./Heatmap";
import { PnLChart } from "./PnLChart";
import { MainChart } from "./MainChart";
import { Sparkline } from "./Sparkline";
import { makeTerminal, withTerminal } from "@/test/fixtures";

describe("charts", () => {
  it("heatmap shows an empty state without positions", () => {
    render(withTerminal(makeTerminal({ portfolio: { cash_balance: 1, total_value: 1, unrealized_pnl: 0, positions: [] } }), <Heatmap />));
    expect(screen.getByText(/no positions yet/i)).toBeInTheDocument();
  });

  it("heatmap renders when there are positions", () => {
    render(withTerminal(makeTerminal(), <Heatmap />));
    expect(screen.getByTestId("heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-chart")).toHaveAttribute("data-cells", "2");
  });

  it("P&L chart reports its data points", () => {
    const snapshots = [
      { total_value: 10000, recorded_at: "2026-09-21T10:00:00Z" },
      { total_value: 10050, recorded_at: "2026-09-21T10:00:30Z" },
    ];
    render(withTerminal(makeTerminal({ snapshots }), <PnLChart />));
    expect(screen.getByTestId("pnl-chart-plot")).toHaveAttribute("data-points", "2");
  });

  it("P&L chart shows an empty state with no snapshots", () => {
    render(withTerminal(makeTerminal(), <PnLChart />));
    expect(screen.getByText(/history starts recording/i)).toBeInTheDocument();
  });

  it("main chart follows the selected ticker", () => {
    const history = { AAPL: [{ t: 1, price: 190 }, { t: 2, price: 191 }, { t: 3, price: 192 }] };
    render(withTerminal(makeTerminal({ history }), <MainChart />));
    expect(screen.getByTestId("main-chart-ticker")).toHaveAttribute("data-ticker", "AAPL");
    expect(screen.getByTestId("main-chart-ticker")).toHaveAttribute("data-points", "3");
    expect(screen.getByTestId("main-chart-price")).toHaveTextContent("200.00");
  });

  it("main chart waits for ticks when history is empty", () => {
    render(withTerminal(makeTerminal(), <MainChart />));
    expect(screen.getByText(/waiting for price ticks/i)).toBeInTheDocument();
  });

  it("sparkline starts empty and fills in", () => {
    const { rerender } = render(<Sparkline points={[]} testId="s" />);
    expect(screen.getByTestId("s")).toHaveAttribute("data-points", "0");
    rerender(<Sparkline points={[{ t: 1, price: 1 }, { t: 2, price: 2 }]} testId="s" />);
    expect(screen.getByTestId("s")).toHaveAttribute("data-points", "2");
  });
});
