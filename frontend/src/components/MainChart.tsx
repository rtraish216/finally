"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTerminal } from "@/hooks/TerminalProvider";
import { dailyChangePercent, fmtNum, fmtPct } from "@/lib/calc";
import { Empty, Panel } from "./Panel";
import { PriceCell } from "./PriceCell";

const fmtTime = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function MainChart() {
  const { selected, prices, history } = useTerminal();
  const tick = selected ? prices[selected] : undefined;
  const points = selected ? (history[selected] ?? []) : [];
  const change = tick ? dailyChangePercent(tick.price, tick.session_start_price) : 0;
  const up = change >= 0;
  const stroke = up ? "#2fbf71" : "#ef5350";

  const right =
    selected && tick ? (
      <div className="flex items-center gap-3">
        <PriceCell price={tick.price} testId="main-chart-price" className="text-ink" />
        <span className={`num text-xs ${up ? "text-up" : "text-down"}`}>{fmtPct(change)}</span>
      </div>
    ) : null;

  return (
    <Panel title={selected ? `${selected} price` : "Price chart"} right={right} testId="main-chart" bodyClassName="p-1">
      <div data-testid="main-chart-ticker" data-ticker={selected ?? ""} data-points={points.length} className="h-full w-full">
        {!selected ? (
          <Empty>Select a ticker in the watchlist to chart it.</Empty>
        ) : points.length < 2 ? (
          <Empty>Waiting for price ticks on {selected}. The chart fills in as prices stream.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={120}>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mainFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#232d3b" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" tickFormatter={fmtTime} stroke="#56637a" tick={{ fontSize: 10 }} minTickGap={48} />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                stroke="#56637a"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => fmtNum(v)}
                width={56}
              />
              {tick && (
                <ReferenceLine y={tick.session_start_price} stroke="#ecad0a" strokeDasharray="4 4" strokeOpacity={0.6} />
              )}
              <Tooltip
                contentStyle={{ background: "#182130", border: "1px solid #232d3b", fontSize: 12 }}
                labelFormatter={(t) => fmtTime(Number(t))}
                formatter={(v) => [fmtNum(Number(v)), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={1.6}
                fill="url(#mainFill)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
