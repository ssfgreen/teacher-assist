export type Provider = "anthropic" | "openai";

export interface TeacherProfile {
  id: string;
  email: string;
  name: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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
  workspaceContextLoaded?: string[];
}
