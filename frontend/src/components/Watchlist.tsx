"use client";

import { useState, type FormEvent } from "react";
import { useTerminal } from "@/hooks/TerminalProvider";
import { dailyChangePercent, fmtPct } from "@/lib/calc";
import { ApiError } from "@/lib/api";
import { Empty, Panel } from "./Panel";
import { PriceCell } from "./PriceCell";
import { Sparkline } from "./Sparkline";

export function Watchlist() {
  const { watchlist, prices, history, selected, select, addTicker, removeTicker } = useTerminal();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const ticker = draft.trim().toUpperCase();
    if (!ticker) return;
    setError(null);
    try {
      await addTicker(ticker);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add ticker");
    }
  }

  async function onRemove(ticker: string) {
    setError(null);
    try {
      await removeTicker(ticker);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove ticker");
    }
  }

  return (
    <Panel title="Watchlist" testId="watchlist" bodyClassName="flex flex-col">
      <form onSubmit={onAdd} className="flex shrink-0 gap-1 border-b border-line p-1.5">
        <input
          data-testid="watchlist-add-input"
          aria-label="Add ticker"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add ticker"
          maxLength={10}
          className="num min-w-0 flex-1 border border-line bg-bg px-2 py-1 text-xs uppercase text-ink placeholder:normal-case placeholder:text-faint"
        />
        <button
          type="submit"
          data-testid="watchlist-add-button"
          className="border border-primary/50 px-2.5 text-xs text-primary hover:bg-primary/10"
        >
          Add
        </button>
      </form>
      {error && (
        <div data-testid="watchlist-error" role="alert" className="border-b border-line px-2 py-1 text-xs text-down">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <Empty>Your watchlist is empty. Add a ticker above.</Empty>
        ) : (
          <ul>
            {watchlist.map((ticker) => {
              const tick = prices[ticker];
              const change = tick ? dailyChangePercent(tick.price, tick.session_start_price) : 0;
              const color = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-dim";
              const active = selected === ticker;
              return (
                <li
                  key={ticker}
                  data-testid={`watchlist-row-${ticker}`}
                  data-selected={active || undefined}
                  onClick={() => select(ticker)}
                  className={`group grid cursor-pointer grid-cols-[3.4rem_1fr_auto_auto] items-center gap-2 border-b border-line/60 border-l-2 px-2 py-1.5 hover:bg-raised ${
                    active ? "border-l-accent bg-raised" : "border-l-transparent"
                  }`}
                >
                  <span className="font-semibold text-ink">{ticker}</span>
                  <span className="flex flex-col items-end leading-tight">
                    {tick ? (
                      <>
                        <PriceCell price={tick.price} testId={`price-${ticker}`} className="text-ink" />
                        <span data-testid={`change-${ticker}`} className={`num px-1 text-[11px] ${color}`}>
                          {fmtPct(change)}
                        </span>
                      </>
                    ) : (
                      <span className="num text-faint">--</span>
                    )}
                  </span>
                  <Sparkline points={history[ticker] ?? []} testId={`sparkline-${ticker}`} />
                  <button
                    data-testid={`watchlist-remove-${ticker}`}
                    aria-label={`Remove ${ticker}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemove(ticker);
                    }}
                    className="px-1 text-faint opacity-0 hover:text-down focus:opacity-100 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
