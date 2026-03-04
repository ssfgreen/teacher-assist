import type {
  ApprovalMode,
  ChatApiResponse,
  ChatMessage,
  Provider,
} from "../types";
import { apiFetch } from "./client";

export async function sendChat(params: {
  messages: ChatMessage[];
  provider: Provider;
  model: string;
  approvalMode: ApprovalMode;
  command?: string;
  sessionId?: string;
  classRef?: string;
}): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendMemoryResponse(params: {
  sessionId: string;
  decisions: Array<{
    text: string;
    decision: "confirm" | "dismiss";
    scope: "teacher" | "class";
    classId?: string;
    category?: "personal" | "pedagogical" | "class";
  }>;
}): Promise<{ ok: true; confirmed: number; dismissed: number }> {
  return apiFetch<{ ok: true; confirmed: number; dismissed: number }>(
    "/api/chat/memory-response",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

export async function sendFeedforwardResponse(params: {
  sessionId: string;
  action: "confirm" | "edit" | "dismiss";
  note?: string;
}): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>("/api/chat/feedforward-response", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendAdjudicationResponse(params: {
  sessionId: string;
  action: "acknowledge" | "skip" | "accept" | "revise" | "alternatives";
  note?: string;
}): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>("/api/chat/adjudication-response", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendQuestionResponse(params: {
  sessionId: string;
  answer: string;
}): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>("/api/chat/question-response", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendApprovalResponse(params: {
  sessionId: string;
  actionId: string;
  decision:
    | "approve"
    | "always_allow"
    | "deny"
    | "approve_selected"
    | "deny_all";
  selectedSkills?: string[];
  selectedContextIds?: string[];
  alternateResponse?: string;
}): Promise<ChatApiResponse> {
  return apiFetch<ChatApiResponse>("/api/chat/approval-response", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendChatStream(
  params: {
    messages: ChatMessage[];
    provider: Provider;
    model: string;
    approvalMode: ApprovalMode;
    command?: string;
    sessionId?: string;
    classRef?: string;
  },
  callbacks: {
    onDelta: (delta: string) => void;
    onMessage?: (message: ChatMessage) => void;
    onContext?: (context: {
      workspaceContextLoaded: string[];
      memoryContextLoaded: string[];
      systemPrompt: string;
      estimatedPromptTokens: number;
    }) => void;
  },
  signal?: AbortSignal,
): Promise<ChatApiResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...params,
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let donePayload: ChatApiResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const lines = rawEvent.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));

      if (!eventLine || !dataLine) {
        continue;
      }

      const eventType = eventLine.slice("event:".length).trim();
      const data = JSON.parse(dataLine.slice("data:".length).trim()) as
        | { text: string }
        | { message: ChatMessage }
        | {
            workspaceContextLoaded: string[];
            memoryContextLoaded: string[];
            systemPrompt: string;
            estimatedPromptTokens: number;
          }
        | { error: string }
        | ChatApiResponse;

      if (eventType === "delta" && "text" in data) {
        callbacks.onDelta(data.text);
      }

      if (eventType === "message" && "message" in data) {
        callbacks.onMessage?.(data.message);
      }

      if (
        eventType === "context" &&
        "systemPrompt" in data &&
        "workspaceContextLoaded" in data &&
        "memoryContextLoaded" in data
      ) {
        callbacks.onContext?.({
          workspaceContextLoaded: data.workspaceContextLoaded,
          memoryContextLoaded: data.memoryContextLoaded,
          systemPrompt: data.systemPrompt,
          estimatedPromptTokens:
            "estimatedPromptTokens" in data &&
            typeof data.estimatedPromptTokens === "number"
              ? data.estimatedPromptTokens
              : 0,
        });
      }

      if (eventType === "error" && "error" in data) {
        throw new Error(data.error);
      }

      if (eventType === "done" && "sessionId" in data) {
        donePayload = data;
      }
    }
  }

  if (!donePayload) {
    throw new Error("Streaming response ended unexpectedly.");
  }

  return donePayload;
}
