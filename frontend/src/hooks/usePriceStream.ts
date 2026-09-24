"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus, PriceMap } from "@/lib/types";

export interface HistoryPoint {
  t: number; // unix seconds
  price: number;
}
export type HistoryMap = Record<string, HistoryPoint[]>;

export const STREAM_URL = "/api/stream/prices";
export const MAX_HISTORY = 900; // ~7.5 minutes at 500ms cadence
const DISCONNECT_AFTER_MS = 8000;
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 15000;

/**
 * Subscribes to the SSE price stream with the native EventSource.
 * EventSource reconnects on its own; we only mirror its state:
 *   open  -> "connected"
 *   error -> "reconnecting" (or "disconnected" if retrying for too long)
 * If the browser gives up (readyState CLOSED, e.g. a non-200 response) we mark "disconnected"
 * and open a new EventSource with exponential backoff (2s .. 15s) so the dot can recover.
 * Price history per ticker accumulates since page load (drives sparklines + main chart).
 */
export function usePriceStream(url: string = STREAM_URL) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [history, setHistory] = useState<HistoryMap>({});
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");
  const historyRef = useRef<HistoryMap>({});

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setStatus("disconnected");
      return;
    }
    let es: EventSource | undefined;
    let dropTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let backoff = RETRY_MIN_MS;
    let stopped = false;

    const clearDrop = () => {
      clearTimeout(dropTimer);
      dropTimer = undefined;
    };

    const connect = () => {
      const source = new EventSource(url);
      es = source;

      source.onopen = () => {
        clearDrop();
        backoff = RETRY_MIN_MS;
        setStatus("connected");
      };

      source.onmessage = (ev: MessageEvent) => {
        let data: PriceMap;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        clearDrop();
        backoff = RETRY_MIN_MS;
        setStatus("connected");
        setPrices((prev) => ({ ...prev, ...data }));
        const next: HistoryMap = { ...historyRef.current };
        for (const [ticker, tick] of Object.entries(data)) {
          const arr = next[ticker] ? next[ticker].slice(-(MAX_HISTORY - 1)) : [];
          arr.push({ t: tick.timestamp, price: tick.price });
          next[ticker] = arr;
        }
        historyRef.current = next;
        setHistory(next);
      };

      source.onerror = () => {
        if (stopped) return;
        if (source.readyState === EventSource.CLOSED) {
          clearDrop();
          // The browser gave up (e.g. a non-200 response). Open a fresh connection after a backoff.
          setStatus("disconnected");
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, RETRY_MAX_MS);
          return;
        }
        // The browser is retrying on its own. Every failed attempt fires onerror, so only
        // arm the timer once; resetting it here would keep the dot yellow forever.
        setStatus((cur) => (cur === "disconnected" ? cur : "reconnecting"));
        if (dropTimer === undefined) {
          dropTimer = setTimeout(() => {
            dropTimer = undefined;
            setStatus("disconnected");
          }, DISCONNECT_AFTER_MS);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(dropTimer);
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [url]);

  return { prices, history, status };
}
