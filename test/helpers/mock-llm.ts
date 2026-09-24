// Trigger phrases for the deterministic LLM_MOCK responses. Source of truth:
// planning/LLM_INTERFACE.md (llm-engineer). Keep in sync with that document.
export const MOCK = {
  buy: (qty: number, ticker: string) => `Buy ${qty} shares of ${ticker}`,
  sell: (qty: number, ticker: string) => `Sell ${qty} shares of ${ticker}`,
  addWatch: (ticker: string) => `Add ${ticker} to my watchlist`,
  removeWatch: (ticker: string) => `Remove ${ticker} from my watchlist`,
  plain: "How is my portfolio doing?",
};
