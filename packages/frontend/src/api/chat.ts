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
