import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceCell } from "./PriceCell";

describe("PriceCell flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not flash on first render", () => {
    render(<PriceCell price={100} testId="p" />);
    expect(screen.getByTestId("p")).not.toHaveClass("flash-up");
    expect(screen.getByTestId("p")).not.toHaveClass("flash-down");
  });

  it("flashes green on an uptick, then clears", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    rerender(<PriceCell price={100.5} testId="p" />);
    expect(screen.getByTestId("p")).toHaveClass("flash-up");
    expect(screen.getByTestId("p")).toHaveAttribute("data-flash", "flash-up");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("p")).not.toHaveClass("flash-up");
  });

  it("flashes red on a downtick", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    rerender(<PriceCell price={99.5} testId="p" />);
    expect(screen.getByTestId("p")).toHaveClass("flash-down");
  });

  it("does not flash when the price is unchanged", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    rerender(<PriceCell price={100} testId="p" />);
    expect(screen.getByTestId("p")).not.toHaveClass("flash-down");
    expect(screen.getByTestId("p")).not.toHaveClass("flash-up");
  });

  it("formats to two decimals", () => {
    render(<PriceCell price={190.5} testId="p" />);
    expect(screen.getByTestId("p")).toHaveTextContent("190.50");
  });
});
