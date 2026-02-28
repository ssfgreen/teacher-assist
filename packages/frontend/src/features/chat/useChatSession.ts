import { useEffect, useRef, useState } from "react";

import { sendChatStream } from "../../api/chat";
import type { ChatMessage, ChatTrace, SessionRecord } from "../../types";

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
  const currentSessionId = currentSession?.id ?? null;
  const previousSessionIdRef = useRef<string | null>(currentSessionId);
  const [messageInput, setMessageInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastContextPaths, setLastContextPaths] = useState<string[]>([]);
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [traceHistory, setTraceHistory] = useState<ChatTrace[]>([]);
  const [contextExpanded, setContextExpanded] = useState(false);

  useEffect(() => {
    if (previousSessionIdRef.current === currentSessionId) {
      return;
    }

    previousSessionIdRef.current = currentSessionId;
    setTraceHistory(currentSession?.traceHistory ?? []);
    setLastContextPaths(currentSession?.contextHistory?.[0] ?? []);
    setActiveSkills(currentSession?.activeSkills ?? []);
  }, [currentSession, currentSessionId]);

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
        messages: response.messages,
        traceHistory: response.trace
          ? [response.trace, ...(activeSession.traceHistory ?? [])]
          : (activeSession.traceHistory ?? []),
        contextHistory: response.workspaceContextLoaded
          ? [
              response.workspaceContextLoaded,
              ...(activeSession.contextHistory ?? []),
            ]
          : (activeSession.contextHistory ?? []),
        activeSkills: response.skillsLoaded ?? activeSession.activeSkills ?? [],
      });
      setLastContextPaths(response.workspaceContextLoaded ?? []);
      setActiveSkills(response.skillsLoaded ?? []);
      if (response.trace) {
        const trace = response.trace;
        setTraceHistory((previous) => [trace, ...previous]);
      }
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
    activeSkills,
    traceHistory,
    sendMessage,
  };
}
