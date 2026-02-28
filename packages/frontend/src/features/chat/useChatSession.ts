import { useState } from "react";

import { sendChatStream } from "../../api/chat";
import type { ChatMessage, SessionRecord } from "../../types";

interface UseChatSessionParams {
  currentSession: SessionRecord | null;
  provider: "anthropic" | "openai";
  model: string;
  selectedClassRef: string;
  createNewSession: () => Promise<SessionRecord>;
  upsertCurrentSession: (session: SessionRecord) => void;
  refreshSessions: () => Promise<void>;
}

export function useChatSession({
  currentSession,
  provider,
  model,
  selectedClassRef,
  createNewSession,
  upsertCurrentSession,
  refreshSessions,
}: UseChatSessionParams) {
  const [messageInput, setMessageInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastContextPaths, setLastContextPaths] = useState<string[]>([]);
  const [contextExpanded, setContextExpanded] = useState(false);

  const sendMessage = async () => {
    const content = messageInput.trim();
    if (!content || chatLoading) {
      return;
    }

    setChatLoading(true);
    setChatError(null);

    try {
      const activeSession = currentSession ?? (await createNewSession());
      const nextMessages = [
        ...activeSession.messages,
        { role: "user", content } as ChatMessage,
      ];

      let assistantContent = "";
      const streamBaseSession = {
        ...activeSession,
        provider,
        model,
      };

      upsertCurrentSession({
        ...streamBaseSession,
        updatedAt: new Date().toISOString(),
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content: "",
          },
        ],
      });

      const response = await sendChatStream(
        {
          sessionId: activeSession.id,
          provider,
          model,
          classRef: selectedClassRef || undefined,
          messages: nextMessages,
        },
        (delta) => {
          assistantContent += delta;
          upsertCurrentSession({
            ...streamBaseSession,
            updatedAt: new Date().toISOString(),
            messages: [
              ...nextMessages,
              {
                role: "assistant",
                content: assistantContent,
              },
            ],
          });
        },
      );

      upsertCurrentSession({
        ...streamBaseSession,
        id: response.sessionId,
        updatedAt: new Date().toISOString(),
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content: response.response.content,
          },
        ],
      });
      setLastContextPaths(response.workspaceContextLoaded ?? []);
      setMessageInput("");
      await refreshSessions();
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Failed to send message",
      );
    } finally {
      setChatLoading(false);
    }
  };

  return {
    messageInput,
    setMessageInput,
    chatLoading,
    chatError,
    contextExpanded,
    setContextExpanded,
    lastContextPaths,
    sendMessage,
  };
}
