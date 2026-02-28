export type Provider = "anthropic" | "openai";

export interface TeacherProfile {
  id: string;
  email: string;
  name: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolError?: boolean;
}

export interface SessionRecord {
  id: string;
  teacherId: string;
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  tasks?: Array<{ id: string; text: string; completed: boolean }>;
  traceHistory?: ChatTrace[];
  contextHistory?: string[][];
  activeSkills?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelResponse {
  content: string;
  toolCalls: unknown[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  stopReason: string;
}

export interface WorkspaceNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceNode[];
}

export interface WorkspaceTreeResponse {
  tree: WorkspaceNode[];
  classRefs: string[];
}

export interface WorkspaceFileResponse {
  path: string;
  content: string;
}

export interface ChatApiResponse {
  response: ModelResponse;
  sessionId: string;
  messages: ChatMessage[];
  skillsLoaded?: string[];
  workspaceContextLoaded?: string[];
  trace?: ChatTrace;
}

export interface SkillManifestItem {
  name: string;
  description: string;
}

export interface SkillFileResponse {
  target: string;
  tier: 2 | 3;
  content: string;
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
