export type Provider = "anthropic" | "openai";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolError?: boolean;
}

export interface SessionTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface ChatTraceStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
}

export interface ChatTrace {
  id: string;
  createdAt: string;
  systemPrompt: string;
  estimatedPromptTokens: number;
  status: "success" | "error_max_turns" | "error_max_budget";
  steps: ChatTraceStep[];
}

export interface ModelResponse {
  content: string;
  toolCalls: ToolCall[];
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
  tasks: SessionTask[];
  traceHistory: ChatTrace[];
  contextHistory: string[][];
  activeSkills: string[];
  createdAt: string;
  updatedAt: string;
}
