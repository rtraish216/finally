"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type {
  ConnectionStatus,
  Portfolio,
  PriceMap,
  Side,
  Snapshot,
  TradeResult,
  WatchlistEntry,
} from "@/lib/types";
import { usePriceStream, type HistoryMap } from "./usePriceStream";

export interface Terminal {
  status: ConnectionStatus;
  prices: PriceMap; // streamed ticks, with watchlist REST values as fallback
  history: HistoryMap;
  watchlist: string[];
  portfolio: Portfolio | null;
  snapshots: Snapshot[];
  selected: string | null;
  select: (ticker: string) => void;
  refreshPortfolio: () => Promise<void>;
  refreshWatchlist: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  /** Refresh everything a trade / chat action can change. */
  refreshAll: () => Promise<void>;
  trade: (ticker: string, quantity: number, side: Side) => Promise<TradeResult>;
  addTicker: (ticker: string) => Promise<void>;
  removeTicker: (ticker: string) => Promise<void>;
}

const Ctx = createContext<Terminal | null>(null);

export function useTerminal(): Terminal {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTerminal must be used inside <TerminalProvider>");
  return v;
}

export const Provider = Ctx.Provider;

const HISTORY_POLL_MS = 30_000;

export function TerminalProvider({ children }: { children: ReactNode }) {
  const stream = usePriceStream();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refreshPortfolio = useCallback(async () => {
    try {
      setPortfolio(await api.portfolio());
    } catch {
      /* keep last known state; connection dot reflects backend health */
    }
  }, []);

  const refreshWatchlist = useCallback(async () => {
    try {
      const list = await api.watchlist();
      setEntries(list);
      setSelected((cur) => cur ?? list[0]?.ticker ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setSnapshots(await api.history());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPortfolio(), refreshWatchlist(), refreshHistory()]);
  }, [refreshPortfolio, refreshWatchlist, refreshHistory]);

  useEffect(() => {
    void refreshAll();
    const id = setInterval(() => void refreshHistory(), HISTORY_POLL_MS);
    return () => clearInterval(id);
  }, [refreshAll, refreshHistory]);

  const trade = useCallback(
    async (ticker: string, quantity: number, side: Side) => {
      const res = await api.trade(ticker, quantity, side);
      await Promise.all([refreshPortfolio(), refreshHistory()]);
      return res;
    },
    [refreshPortfolio, refreshHistory],
  );

  const addTicker = useCallback(
    async (ticker: string) => {
      await api.addTicker(ticker);
      await refreshWatchlist();
    },
    [refreshWatchlist],
  );

  const removeTicker = useCallback(
    async (ticker: string) => {
      await api.removeTicker(ticker);
      setSelected((cur) => (cur === ticker ? null : cur));
      await refreshWatchlist();
    },
    [refreshWatchlist],
  );

  // Watchlist REST values fill in until the first SSE event arrives.
  const prices = useMemo<PriceMap>(() => {
    const seed: PriceMap = {};
    for (const e of entries) {
      seed[e.ticker] = {
        ticker: e.ticker,
        price: e.price,
        previous_price: e.previous_price,
        session_start_price: e.session_start_price,
        timestamp: 0,
        direction: "flat",
      };
    }
    return { ...seed, ...stream.prices };
  }, [entries, stream.prices]);

  const watchlist = useMemo(() => entries.map((e) => e.ticker), [entries]);

  const value = useMemo<Terminal>(
    () => ({
      status: stream.status,
      prices,
      history: stream.history,
      watchlist,
      portfolio,
      snapshots,
      selected,
      select: setSelected,
      refreshPortfolio,
      refreshWatchlist,
      refreshHistory,
      refreshAll,
      trade,
      addTicker,
      removeTicker,
    }),
    [
      stream.status,
      stream.history,
      prices,
      watchlist,
      portfolio,
      snapshots,
      selected,
      refreshPortfolio,
      refreshWatchlist,
      refreshHistory,
      refreshAll,
      trade,
      addTicker,
      removeTicker,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
