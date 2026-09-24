import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePriceStream, MAX_HISTORY } from "./usePriceStream";
import { FakeEventSource, tick } from "@/test/fixtures";

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe("usePriceStream", () => {
  it("connects to the SSE endpoint and reports status", () => {
    const { result } = renderHook(() => usePriceStream());
    expect(FakeEventSource.last.url).toBe("/api/stream/prices");
    expect(result.current.status).toBe("reconnecting");
    act(() => FakeEventSource.last.open());
    expect(result.current.status).toBe("connected");
  });

  it("goes yellow on a transient error and red when the stream is closed", () => {
    const { result } = renderHook(() => usePriceStream());
    act(() => FakeEventSource.last.open());
    act(() => FakeEventSource.last.fail(false));
    expect(result.current.status).toBe("reconnecting");
    act(() => FakeEventSource.last.fail(true));
    expect(result.current.status).toBe("disconnected");
  });

  it("goes red if reconnecting drags on", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePriceStream());
    act(() => FakeEventSource.last.fail(false));
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current.status).toBe("disconnected");
    vi.useRealTimers();
  });

  it("stores latest prices and accumulates per-ticker history", () => {
    const { result } = renderHook(() => usePriceStream());
    act(() => FakeEventSource.last.emit({ AAPL: tick("AAPL", 190), MSFT: tick("MSFT", 400) }));
    act(() => FakeEventSource.last.emit({ AAPL: { ...tick("AAPL", 191), timestamp: 1758400001 } }));
    expect(result.current.status).toBe("connected");
    expect(result.current.prices.AAPL.price).toBe(191);
    expect(result.current.prices.MSFT.price).toBe(400);
    expect(result.current.history.AAPL.map((p) => p.price)).toEqual([190, 191]);
    expect(result.current.history.MSFT).toHaveLength(1);
  });

  it("caps history length", () => {
    const { result } = renderHook(() => usePriceStream());
    act(() => {
      for (let i = 0; i < MAX_HISTORY + 20; i++) FakeEventSource.last.emit({ AAPL: tick("AAPL", 100 + i) });
    });
    expect(result.current.history.AAPL).toHaveLength(MAX_HISTORY);
    expect(result.current.history.AAPL.at(-1)?.price).toBe(100 + MAX_HISTORY + 19);
  });

  it("ignores malformed events and closes on unmount", () => {
    const { result, unmount } = renderHook(() => usePriceStream());
    const es = FakeEventSource.last;
    act(() => es.onmessage?.({ data: "not json" } as MessageEvent));
    expect(result.current.prices).toEqual({});
    unmount();
    expect(es.closed).toBe(true);
  });
});

describe("usePriceStream manual reconnect", () => {
  it("opens a new EventSource after the browser gives up, and recovers", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePriceStream());
    const first = FakeEventSource.last;
    act(() => first.fail(true));
    expect(result.current.status).toBe("disconnected");
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => FakeEventSource.last.open());
    expect(result.current.status).toBe("connected");
    vi.useRealTimers();
  });

  it("backs off between retries and stops after unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => usePriceStream());
    act(() => FakeEventSource.last.fail(true));
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    act(() => FakeEventSource.last.fail(true));
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(FakeEventSource.instances).toHaveLength(2); // second retry waits 4s
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(FakeEventSource.instances).toHaveLength(3);
    act(() => FakeEventSource.last.fail(true));
    unmount();
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(FakeEventSource.instances).toHaveLength(3);
    vi.useRealTimers();
  });
});

describe("usePriceStream retry loop", () => {
  it("turns red after 8s of failed retries even though onerror keeps firing", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePriceStream());
    act(() => FakeEventSource.last.open());
    // Chrome retries about every 3s and fires onerror for each failed attempt.
    act(() => FakeEventSource.last.fail(false));
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => FakeEventSource.last.fail(false));
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => FakeEventSource.last.fail(false));
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => FakeEventSource.last.fail(false));
    expect(result.current.status).toBe("disconnected");
    // A later event brings it back to green.
    act(() => FakeEventSource.last.emit({ AAPL: tick("AAPL", 1) }));
    expect(result.current.status).toBe("connected");
    vi.useRealTimers();
  });
});
