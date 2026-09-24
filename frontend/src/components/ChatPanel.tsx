"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTerminal } from "@/hooks/TerminalProvider";
import { ApiError, api } from "@/lib/api";
import { fmtNum, fmtQty } from "@/lib/calc";
import type { ChatActions, ChatMessage } from "@/lib/types";

export function ActionList({ actions }: { actions: ChatActions | null }) {
  if (!actions) return null;
  const trades = actions.trades ?? [];
  const changes = actions.watchlist_changes ?? [];
  if (trades.length === 0 && changes.length === 0) return null;

  return (
    <ul className="mt-1.5 space-y-1" data-testid="chat-actions">
      {trades.map((t, i) => {
        const ok = t.status === "executed";
        const verb = t.side === "buy" ? "Bought" : "Sold";
        return (
          <li
            key={`t${i}`}
            data-testid="chat-action"
            data-kind="trade"
            data-status={t.status}
            className={`border-l-2 px-2 py-1 text-xs ${
              ok ? "border-up bg-up/10 text-up" : "border-down bg-down/10 text-down"
            }`}
          >
            {ok
              ? `${verb} ${fmtQty(t.quantity)} ${t.ticker}${t.price != null ? ` at ${fmtNum(t.price)}` : ""}`
              : `${t.side === "buy" ? "Buy" : "Sell"} ${fmtQty(t.quantity)} ${t.ticker} failed: ${t.error ?? "unknown error"}`}
          </li>
        );
      })}
      {changes.map((c, i) => {
        const ok = c.status === "executed";
        return (
          <li
            key={`w${i}`}
            data-testid="chat-action"
            data-kind="watchlist"
            data-status={c.status}
            className={`border-l-2 px-2 py-1 text-xs ${
              ok ? "border-primary bg-primary/10 text-primary" : "border-down bg-down/10 text-down"
            }`}
          >
            {ok
              ? `${c.action === "add" ? "Added" : "Removed"} ${c.ticker} ${c.action === "add" ? "to" : "from"} watchlist`
              : `Could not ${c.action} ${c.ticker}: ${c.error ?? "unknown error"}`}
          </li>
        );
      })}
    </ul>
  );
}

export function MessageBubble({ m }: { m: ChatMessage }) {
  const user = m.role === "user";
  return (
    <div
      data-testid="chat-message"
      data-role={m.role}
      className={`flex flex-col ${user ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[92%] whitespace-pre-wrap px-2.5 py-1.5 text-[13px] leading-snug ${
          user ? "bg-submit/40 text-ink" : "border border-line bg-raised text-ink"
        }`}
      >
        {m.content}
        {!user && <ActionList actions={m.actions} />}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { refreshAll } = useTerminal();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .chatHistory()
      .then((m) => !cancelled && setMessages(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text, actions: null, created_at: new Date().toISOString() }]);
    setLoading(true);
    try {
      const res = await api.chat(text);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.message,
          actions: { trades: res.trades ?? [], watchlist_changes: res.watchlist_changes ?? [] },
          created_at: new Date().toISOString(),
        },
      ]);
      if ((res.trades?.length ?? 0) > 0 || (res.watchlist_changes?.length ?? 0) > 0) void refreshAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The assistant is unavailable");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <aside className="flex w-9 shrink-0 flex-col items-center border-l border-line bg-panel py-2" data-testid="chat-panel" data-open="false">
        <button
          data-testid="chat-toggle"
          aria-label="Open AI chat"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="text-accent hover:brightness-125"
        >
          ‹
        </button>
        <span className="mt-3 text-xs text-dim [writing-mode:vertical-rl]">AI assistant</span>
      </aside>
    );
  }

  return (
    <aside
      data-testid="chat-panel"
      data-open="true"
      className="flex min-h-0 w-full shrink-0 flex-col border-l border-line bg-panel lg:w-[340px]"
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-line px-2.5">
        <h2 className="text-xs font-medium text-dim">
          <span className="text-accent">FinAlly</span> assistant
        </h2>
        <button
          data-testid="chat-toggle"
          aria-label="Collapse AI chat"
          aria-expanded
          onClick={() => setOpen(false)}
          className="px-1 text-dim hover:text-ink"
        >
          ›
        </button>
      </header>

      <div data-testid="chat-messages" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {messages.length === 0 && !loading && (
          <p className="text-xs text-faint" data-testid="chat-empty">
            Ask about your portfolio, or tell me to trade. Try &ldquo;Buy 5 shares of AAPL&rdquo; or &ldquo;How concentrated am I in tech?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={`${m.created_at}-${i}`} m={m} />
        ))}
        {loading && (
          <div data-testid="chat-loading" role="status" aria-label="Assistant is thinking" className="flex items-center gap-1 px-1 text-dim">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
          </div>
        )}
        {error && (
          <div data-testid="chat-error" role="alert" className="border-l-2 border-down bg-down/10 px-2 py-1 text-xs text-down">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex shrink-0 gap-1.5 border-t border-line p-2">
        <input
          data-testid="chat-input"
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message FinAlly"
          className="min-w-0 flex-1 border border-line bg-bg px-2 py-1.5 text-[13px] text-ink placeholder:text-faint"
        />
        <button
          type="submit"
          data-testid="chat-send"
          disabled={loading || !draft.trim()}
          className="bg-submit px-3 text-[13px] font-medium text-white hover:brightness-125 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
