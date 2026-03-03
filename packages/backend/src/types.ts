import type {
  ChatMessage as SharedChatMessage,
  Provider as SharedProvider,
  TokenUsage as SharedTokenUsage,
} from "../../shared/types";

export type Provider = SharedProvider;

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

export type ChatMessage = SharedChatMessage;

export interface SessionTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export type TokenUsage = SharedTokenUsage;

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
  usage: TokenUsage;
  status: "success" | "error_max_turns" | "error_max_budget";
  steps: ChatTraceStep[];
  memorySelectionSummary?: string;
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
  classRef?: string | null;
  messages: ChatMessage[];
  tasks: SessionTask[];
  traceHistory: ChatTrace[];
  contextHistory: string[][];
  memoryContextHistory?: string[][];
  activeSkills: string[];
  createdAt: string;
  updatedAt: string;
}
