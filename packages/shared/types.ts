export type Provider = "anthropic" | "openai";
export type ApprovalMode = "automation" | "feedforward";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolError?: boolean;
  toolCacheHit?: boolean;
  toolMetadata?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
