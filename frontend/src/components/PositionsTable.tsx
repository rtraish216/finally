"use client";

import { useTerminal } from "@/hooks/TerminalProvider";
import { fmtNum, fmtPct, fmtQty, fmtSigned, livePositions } from "@/lib/calc";
import { Empty, Panel } from "./Panel";

export function PositionsTable() {
  const { portfolio, prices, select } = useTerminal();
  const positions = livePositions(portfolio, prices);

  return (
    <Panel title="Positions" testId="positions" bodyClassName="overflow-auto">
      {positions.length === 0 ? (
        <Empty>No open positions. Use the trade bar to buy your first shares.</Empty>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-panel text-faint">
            <tr className="border-b border-line">
              <th className="px-2.5 py-1 text-left font-medium">Ticker</th>
              <th className="px-2.5 py-1 text-right font-medium">Qty</th>
              <th className="px-2.5 py-1 text-right font-medium">Avg cost</th>
              <th className="px-2.5 py-1 text-right font-medium">Price</th>
              <th className="px-2.5 py-1 text-right font-medium">P&amp;L</th>
              <th className="px-2.5 py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const color = p.unrealized_pnl > 0 ? "text-up" : p.unrealized_pnl < 0 ? "text-down" : "text-dim";
              return (
                <tr
                  key={p.ticker}
                  data-testid={`position-row-${p.ticker}`}
                  onClick={() => select(p.ticker)}
                  className="cursor-pointer border-b border-line/60 hover:bg-raised"
                >
                  <td className="px-2.5 py-1 font-semibold text-ink">{p.ticker}</td>
                  <td data-testid={`position-qty-${p.ticker}`} className="num px-2.5 py-1 text-right">
                    {fmtQty(p.quantity)}
                  </td>
                  <td data-testid={`position-avg-${p.ticker}`} className="num px-2.5 py-1 text-right">
                    {fmtNum(p.avg_cost)}
                  </td>
                  <td data-testid={`position-price-${p.ticker}`} className="num px-2.5 py-1 text-right">
                    {fmtNum(p.current_price)}
                  </td>
                  <td data-testid={`position-pnl-${p.ticker}`} className={`num px-2.5 py-1 text-right ${color}`}>
                    {fmtSigned(p.unrealized_pnl)}
                  </td>
                  <td data-testid={`position-pct-${p.ticker}`} className={`num px-2.5 py-1 text-right ${color}`}>
                    {fmtPct(p.unrealized_pnl_percent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
