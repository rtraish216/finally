import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Watchlist } from "./Watchlist";
import { ApiError } from "@/lib/api";
import { makeTerminal, withTerminal } from "@/test/fixtures";

describe("Watchlist", () => {
  it("renders a row per ticker with price and daily change", () => {
    render(withTerminal(makeTerminal(), <Watchlist />));
    expect(screen.getAllByTestId(/^watchlist-row-/)).toHaveLength(3);
    expect(screen.getByTestId("price-AAPL")).toHaveTextContent("200.00");
    // (200-190)/190 = +5.26%
    expect(screen.getByTestId("change-AAPL")).toHaveTextContent("+5.26%");
    expect(screen.getByTestId("change-AAPL")).toHaveClass("text-up");
    expect(screen.getByTestId("change-GOOGL")).toHaveTextContent("-2.86%");
    expect(screen.getByTestId("change-GOOGL")).toHaveClass("text-down");
  });

  it("marks the selected row and selects on click", async () => {
    const select = vi.fn();
    render(withTerminal(makeTerminal({ select, selected: "AAPL" }), <Watchlist />));
    expect(screen.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");
    await userEvent.click(screen.getByTestId("watchlist-row-MSFT"));
    expect(select).toHaveBeenCalledWith("MSFT");
  });

  it("adds an uppercased ticker and clears the input", async () => {
    const addTicker = vi.fn().mockResolvedValue(undefined);
    render(withTerminal(makeTerminal({ addTicker }), <Watchlist />));
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(addTicker).toHaveBeenCalledWith("PYPL");
    await waitFor(() => expect(screen.getByTestId("watchlist-add-input")).toHaveValue(""));
  });

  it("shows the server error when adding fails", async () => {
    const addTicker = vi.fn().mockRejectedValue(new ApiError(404, "Unknown ticker ZZZZ"));
    render(withTerminal(makeTerminal({ addTicker }), <Watchlist />));
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "zzzz");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByTestId("watchlist-error")).toHaveTextContent("Unknown ticker ZZZZ");
  });

  it("removes a ticker without selecting the row", async () => {
    const removeTicker = vi.fn().mockResolvedValue(undefined);
    const select = vi.fn();
    render(withTerminal(makeTerminal({ removeTicker, select }), <Watchlist />));
    await userEvent.click(screen.getByTestId("watchlist-remove-GOOGL"));
    expect(removeTicker).toHaveBeenCalledWith("GOOGL");
    expect(select).not.toHaveBeenCalled();
  });

  it("shows an empty state", () => {
    render(withTerminal(makeTerminal({ watchlist: [] }), <Watchlist />));
    expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument();
  });
});
