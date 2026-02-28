import type { Provider } from "../../types";

export const MODEL_OPTIONS: Record<Provider, string[]> = {
  anthropic: ["mock-anthropic", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: [
    "mock-openai",
    "gpt-5.2-2025-12-11",
    "gpt-5-mini-2025-08-07",
    "gpt-5-nano-2025-08-07",
  ],
};
