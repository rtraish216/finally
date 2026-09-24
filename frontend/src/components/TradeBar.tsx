"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTerminal } from "@/hooks/TerminalProvider";
import { ApiError } from "@/lib/api";
import { fmtNum, fmtQty } from "@/lib/calc";
import type { Side } from "@/lib/types";
import { Panel } from "./Panel";

interface Feedback {
  ok: boolean;
  text: string;
}

export function TradeBar() {
  const { selected, trade } = useTerminal();
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Picking a ticker elsewhere pre-fills the trade bar.
  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  async function submit(side: Side) {
    const t = ticker.trim().toUpperCase();
    const q = Number(quantity);
    if (!t) return setFeedback({ ok: false, text: "Enter a ticker." });
    if (!Number.isFinite(q) || q <= 0) return setFeedback({ ok: false, text: "Enter a quantity greater than zero." });
    setBusy(true);
    setFeedback(null);
    try {
      const res = await trade(t, q, side);
      setFeedback({
        ok: true,
        text: `${side === "buy" ? "Bought" : "Sold"} ${fmtQty(res.quantity)} ${res.ticker} at ${fmtNum(res.price)}`,
      });
      setQuantity("");
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof ApiError ? err.message : "Trade failed" });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  const field = "num min-w-0 border border-line bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-faint";

  return (
    <Panel title="Trade" testId="trade-bar" bodyClassName="p-2">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <input
          data-testid="trade-ticker"
          aria-label="Ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker"
          maxLength={10}
          className={`${field} w-20 uppercase placeholder:normal-case`}
        />
        <input
          data-testid="trade-quantity"
          aria-label="Quantity"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Quantity"
          className={`${field} w-28`}
        />
        <button
          type="button"
          data-testid="trade-buy"
          disabled={busy}
          onClick={() => void submit("buy")}
          className="bg-submit px-3.5 py-1.5 text-sm font-medium text-white hover:brightness-125 disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          data-testid="trade-sell"
          disabled={busy}
          onClick={() => void submit("sell")}
          className="border border-submit px-3.5 py-1.5 text-sm font-medium text-white hover:bg-submit/30 disabled:opacity-50"
        >
          Sell
        </button>
        <span className="text-xs text-faint">Market order, fills instantly at the current price.</span>
      </form>
      <div
        data-testid="trade-feedback"
        data-ok={feedback ? String(feedback.ok) : undefined}
        role={feedback && !feedback.ok ? "alert" : "status"}
        className={`mt-1.5 min-h-4 text-xs ${feedback?.ok ? "text-up" : "text-down"}`}
      >
        {feedback?.text}
      </div>
    </Panel>
  );
}
