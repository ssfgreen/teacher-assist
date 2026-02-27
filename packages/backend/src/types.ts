export type Provider = "anthropic" | "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface ModelResponse {
  content: string;
  toolCalls: unknown[];
  usage: TokenUsage;
  stopReason: "stop" | "max_tokens" | "tool_use" | "error";
}

export interface Teacher {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

export interface SessionRecord {
  id: string;
  teacherId: string;
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
