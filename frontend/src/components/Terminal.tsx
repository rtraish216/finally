"use client";

import { TerminalProvider } from "@/hooks/TerminalProvider";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { MainChart } from "./MainChart";
import { PnLChart } from "./PnLChart";
import { PositionsTable } from "./PositionsTable";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";

export function Terminal() {
  return (
    <TerminalProvider>
      <div className="flex min-h-screen flex-col lg:h-screen">
        <Header />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="grid min-h-0 min-w-0 flex-1 gap-1 p-1 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
            <div className="h-80 lg:h-auto lg:min-h-0">
              <Watchlist />
            </div>
            <div className="grid min-h-0 min-w-0 gap-1 lg:grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="h-72 lg:h-auto lg:min-h-0">
                <MainChart />
              </div>
              <div className="grid min-h-0 gap-1 md:grid-cols-2">
                <div className="h-56 lg:h-auto lg:min-h-0">
                  <Heatmap />
                </div>
                <div className="h-56 lg:h-auto lg:min-h-0">
                  <PnLChart />
                </div>
              </div>
              <div className="grid min-h-0 gap-1 md:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="h-56 lg:h-auto lg:min-h-0">
                  <PositionsTable />
                </div>
                <div>
                  <TradeBar />
                </div>
              </div>
            </div>
          </div>
          <ChatPanel />
        </div>
      </div>
    </TerminalProvider>
  );
}
