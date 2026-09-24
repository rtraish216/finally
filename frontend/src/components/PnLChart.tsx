"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTerminal } from "@/hooks/TerminalProvider";
import { fmtNum, fmtUsd } from "@/lib/calc";
import { Empty, Panel } from "./Panel";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

export function PnLChart() {
  const { snapshots } = useTerminal();
  return (
    <Panel title="Portfolio value over time" testId="pnl-chart" bodyClassName="p-1">
      {snapshots.length === 0 ? (
        <Empty>Portfolio history starts recording once the app has been running for a moment.</Empty>
      ) : (
        <div data-testid="pnl-chart-plot" data-points={snapshots.length} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%" minHeight={100}>
            <LineChart data={snapshots} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#232d3b" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="recorded_at" tickFormatter={fmtTime} stroke="#56637a" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                stroke="#56637a"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => fmtNum(v, 0)}
                width={56}
              />
              <Tooltip
                contentStyle={{ background: "#182130", border: "1px solid #232d3b", fontSize: 12 }}
                labelFormatter={(t) => new Date(String(t)).toLocaleString()}
                formatter={(v) => [fmtUsd(Number(v)), "Total value"]}
              />
              <Line
                type="monotone"
                dataKey="total_value"
                stroke="#209dd7"
                strokeWidth={1.6}
                dot={snapshots.length < 3}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
