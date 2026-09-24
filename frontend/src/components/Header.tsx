"use client";

import { useTerminal } from "@/hooks/TerminalProvider";
import { fmtSigned, fmtUsd, portfolioTotals } from "@/lib/calc";
import type { ConnectionStatus } from "@/lib/types";

const STATUS: Record<ConnectionStatus, { color: string; label: string; cls: string }> = {
  connected: { color: "bg-up", label: "Live", cls: "" },
  reconnecting: { color: "bg-accent", label: "Reconnecting", cls: "dot-reconnecting" },
  disconnected: { color: "bg-down", label: "Disconnected", cls: "" },
};

export function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const s = STATUS[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-dim">
      <span
        data-testid="connection-dot"
        data-status={status}
        role="status"
        aria-label={`Connection: ${s.label}`}
        className={`inline-block h-2.5 w-2.5 rounded-full ${s.color} ${s.cls}`}
      />
      <span data-testid="connection-label">{s.label}</span>
    </span>
  );
}

export function Header() {
  const { portfolio, prices, status } = useTerminal();
  const t = portfolioTotals(portfolio, prices);
  const pnlColor = t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : "text-dim";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tracking-tight text-ink">
          Fin<span className="text-accent">Ally</span>
        </span>
        <span className="hidden text-xs text-faint sm:inline">AI trading workstation</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[11px] text-faint">Portfolio value</span>
          <span data-testid="portfolio-total" data-value={t.total} className="num text-lg font-semibold text-ink">
            {portfolio ? fmtUsd(t.total) : "--"}
          </span>
        </div>
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="text-[11px] text-faint">Unrealized P&amp;L</span>
          <span data-testid="portfolio-pnl" className={`num text-sm ${pnlColor}`}>
            {portfolio ? `${fmtSigned(t.pnl)}` : "--"}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[11px] text-faint">Cash</span>
          <span data-testid="cash-balance" data-value={t.cash} className="num text-sm text-ink">
            {portfolio ? fmtUsd(t.cash) : "--"}
          </span>
        </div>
        <ConnectionDot status={status} />
      </div>
    </header>
  );
}
