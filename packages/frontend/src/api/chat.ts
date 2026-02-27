import type { ChatMessage, ModelResponse, Provider } from "../types";
import { apiFetch } from "./client";

export async function sendChat(params: {
  messages: ChatMessage[];
  provider: Provider;
  model: string;
  sessionId?: string;
}): Promise<{ response: ModelResponse; sessionId: string }> {
  return apiFetch<{ response: ModelResponse; sessionId: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendChatStream(
  params: {
    messages: ChatMessage[];
    provider: Provider;
    model: string;
    sessionId?: string;
  },
  onDelta: (delta: string) => void,
): Promise<{ response: ModelResponse; sessionId: string }> {
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
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let donePayload: { response: ModelResponse; sessionId: string } | null = null;

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
        | { error: string }
        | { response: ModelResponse; sessionId: string };

      if (eventType === "delta" && "text" in data) {
        onDelta(data.text);
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
