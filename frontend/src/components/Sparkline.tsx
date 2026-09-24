"use client";

import { Line, LineChart, YAxis } from "recharts";
import type { HistoryPoint } from "@/hooks/usePriceStream";

interface Props {
  points: HistoryPoint[];
  width?: number;
  height?: number;
  testId?: string;
}

const MAX_POINTS = 80;

export function Sparkline({ points, width = 84, height = 24, testId }: Props) {
  const data = points.slice(-MAX_POINTS);
  if (data.length < 2) {
    return <div data-testid={testId} data-points={data.length} style={{ width, height }} />;
  }
  const up = data[data.length - 1].price >= data[0].price;
  return (
    <div data-testid={testId} data-points={data.length} style={{ width, height }}>
      <LineChart width={width} height={height} data={data} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line
          type="monotone"
          dataKey="price"
          stroke={up ? "#2fbf71" : "#ef5350"}
          strokeWidth={1.25}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
