import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TradeBar } from "./TradeBar";
import { ApiError } from "@/lib/api";
import { makeTerminal, withTerminal } from "@/test/fixtures";

describe("TradeBar", () => {
  it("pre-fills the ticker from the selection", () => {
    render(withTerminal(makeTerminal({ selected: "MSFT" }), <TradeBar />));
    expect(screen.getByTestId("trade-ticker")).toHaveValue("MSFT");
  });

  it("submits a buy immediately with no confirmation and reports the fill", async () => {
    const trade = vi.fn().mockResolvedValue({ ticker: "AAPL", side: "buy", quantity: 2.5, price: 190.5, executed_at: "", cash_balance: 0 });
    render(withTerminal(makeTerminal({ trade }), <TradeBar />));
    await userEvent.type(screen.getByTestId("trade-quantity"), "2.5");
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(trade).toHaveBeenCalledWith("AAPL", 2.5, "buy");
    expect(await screen.findByTestId("trade-feedback")).toHaveTextContent("Bought 2.5 AAPL at 190.50");
    expect(screen.getByTestId("trade-quantity")).toHaveValue(null);
  });

  it("submits a sell", async () => {
    const trade = vi.fn().mockResolvedValue({ ticker: "AAPL", side: "sell", quantity: 1, price: 200, executed_at: "", cash_balance: 0 });
    render(withTerminal(makeTerminal({ trade }), <TradeBar />));
    await userEvent.type(screen.getByTestId("trade-quantity"), "1");
    await userEvent.click(screen.getByTestId("trade-sell"));
    expect(trade).toHaveBeenCalledWith("AAPL", 1, "sell");
  });

  it("shows the backend error for a rejected trade", async () => {
    const trade = vi.fn().mockRejectedValue(new ApiError(400, "Insufficient cash"));
    render(withTerminal(makeTerminal({ trade }), <TradeBar />));
    await userEvent.type(screen.getByTestId("trade-quantity"), "1000");
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(await screen.findByTestId("trade-feedback")).toHaveTextContent("Insufficient cash");
    expect(screen.getByTestId("trade-feedback")).toHaveAttribute("data-ok", "false");
  });

  it("validates quantity client-side", async () => {
    const trade = vi.fn();
    render(withTerminal(makeTerminal({ trade }), <TradeBar />));
    await userEvent.click(screen.getByTestId("trade-buy"));
    expect(trade).not.toHaveBeenCalled();
    expect(screen.getByTestId("trade-feedback")).toHaveTextContent(/quantity/i);
  });
});
