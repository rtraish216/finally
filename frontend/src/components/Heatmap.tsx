"use client";

import { ResponsiveContainer, Treemap } from "recharts";
import { useTerminal } from "@/hooks/TerminalProvider";
import { livePositions, fmtPct } from "@/lib/calc";
import { pnlColor } from "@/lib/color";
import { Empty, Panel } from "./Panel";

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pnlPct?: number;
  depth?: number;
}

/** Custom treemap cell: filled by P&L, labelled with ticker and P&L %. */
function Cell({ x = 0, y = 0, width = 0, height = 0, name, pnlPct = 0, depth = 0 }: CellProps) {
  if (depth < 1 || !name) return <g />;
  const showLabel = width > 44 && height > 30;
  return (
    <g data-testid={`heatmap-cell-${name}`} data-pnl-pct={pnlPct.toFixed(2)} data-fill={pnlColor(pnlPct)}>
      <rect x={x} y={y} width={width} height={height} fill={pnlColor(pnlPct)} stroke="#0d1117" strokeWidth={2} />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18} fill="#ffffff" fontSize={13} fontWeight={600}>
            {name}
          </text>
          <text x={x + 8} y={y + 34} fill="#ffffff" fillOpacity={0.8} fontSize={11} fontFamily="ui-monospace, monospace">
            {fmtPct(pnlPct)}
          </text>
        </>
      )}
    </g>
  );
}

export function Heatmap() {
  const { portfolio, prices } = useTerminal();
  const positions = livePositions(portfolio, prices);
  const data = positions
    .filter((p) => p.market_value > 0)
    .map((p) => ({ name: p.ticker, size: p.market_value, pnlPct: p.unrealized_pnl_percent }));

  return (
    <Panel title="Portfolio heatmap" testId="heatmap" bodyClassName="p-1">
      {data.length === 0 ? (
        <Empty>No positions yet. Buy a share and it appears here, sized by weight and colored by P&amp;L.</Empty>
      ) : (
        <div data-testid="heatmap-chart" data-cells={data.length} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%" minHeight={100}>
            <Treemap data={data} dataKey="size" content={<Cell />} isAnimationActive={false} />
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
