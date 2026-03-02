import { useEffect, useRef, useState } from "react";

import { sendChatStream } from "../../api/chat";
import { useMemoryStore } from "../../stores/memoryStore";
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const setMemoryProposals = useMemoryStore((state) => state.setProposals);
  const clearMemoryProposals = useMemoryStore((state) => state.clearProposals);

  const [messageInput, setMessageInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastContextPaths, setLastContextPaths] = useState<string[]>([]);
  const [lastMemoryContextPaths, setLastMemoryContextPaths] = useState<
    string[]
  >([]);
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
    setLastMemoryContextPaths(currentSession?.memoryContextHistory?.[0] ?? []);
    setActiveSkills(currentSession?.activeSkills ?? []);
  }, [currentSession, currentSessionId]);

  const sendMessage = async () => {
    const content = messageInput.trim();
    if (!content || chatLoading) {
      return;
    }

    setMessageInput("");
    setChatLoading(true);
    setChatError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const activeSession = currentSession ?? (await createNewSession());
      const nextMessages = [
        ...activeSession.messages,
        { role: "user", content } as ChatMessage,
      ];

      let assistantContent = "";
      const streamedToolMessages: ChatMessage[] = [];
      let streamedContextPaths: string[] = [];
      let streamedMemoryContextPaths: string[] = [];
      let previewTrace: ChatTrace | null = null;
      const streamBaseSession = {
        ...activeSession,
        provider,
        model,
      };

      const upsertStreamingSession = () => {
        upsertCurrentSession({
          ...streamBaseSession,
          updatedAt: new Date().toISOString(),
          contextHistory:
            streamedContextPaths.length > 0
              ? [streamedContextPaths, ...(activeSession.contextHistory ?? [])]
              : (activeSession.contextHistory ?? []),
          memoryContextHistory:
            streamedMemoryContextPaths.length > 0
              ? [
                  streamedMemoryContextPaths,
                  ...(activeSession.memoryContextHistory ?? []),
                ]
              : (activeSession.memoryContextHistory ?? []),
          messages: [
            ...nextMessages,
            ...streamedToolMessages,
            {
              role: "assistant",
              content: assistantContent,
            },
          ],
        });
      };

      upsertStreamingSession();

      const response = await sendChatStream(
        {
          sessionId: activeSession.id,
          provider,
          model,
          classRef: selectedClassRef || undefined,
          messages: nextMessages,
        },
        {
          onDelta: (delta) => {
            assistantContent += delta;
            upsertStreamingSession();
          },
          onMessage: (message) => {
            streamedToolMessages.push(message);
            upsertStreamingSession();
          },
          onContext: (context) => {
            streamedContextPaths = context.workspaceContextLoaded;
            streamedMemoryContextPaths = context.memoryContextLoaded;

            previewTrace = {
              id: `preview-${activeSession.id}`,
              createdAt: new Date().toISOString(),
              systemPrompt: context.systemPrompt,
              estimatedPromptTokens: context.estimatedPromptTokens,
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                estimatedCostUsd: 0,
              },
              status: "success",
              steps: [],
            };

            setTraceHistory((previous) => {
              const withoutPreview = previous.filter(
                (trace) => trace.id !== previewTrace?.id,
              );
              return [previewTrace as ChatTrace, ...withoutPreview];
            });
            setLastContextPaths(streamedContextPaths);
            setLastMemoryContextPaths(streamedMemoryContextPaths);
            upsertStreamingSession();
          },
        },
        abortController.signal,
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
        memoryContextHistory: response.memoryContextLoaded
          ? [
              response.memoryContextLoaded,
              ...(activeSession.memoryContextHistory ?? []),
            ]
          : (activeSession.memoryContextHistory ?? []),
        activeSkills: response.skillsLoaded ?? activeSession.activeSkills ?? [],
      });
      setLastContextPaths(response.workspaceContextLoaded ?? []);
      setLastMemoryContextPaths(response.memoryContextLoaded ?? []);
      setActiveSkills(response.skillsLoaded ?? []);
      if (response.trace) {
        setTraceHistory((previous) => [
          response.trace as ChatTrace,
          ...previous.filter((trace) => trace.id !== previewTrace?.id),
        ]);
      } else if (previewTrace) {
        setTraceHistory((previous) =>
          previous.filter((trace) => trace.id !== previewTrace?.id),
        );
      }
      if (response.status === "awaiting_memory_capture" && response.proposals) {
        setMemoryProposals(response.proposals);
      } else {
        clearMemoryProposals();
      }
      await refreshSessions();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setChatError("Generation cancelled");
      } else {
        setChatError(
          error instanceof Error ? error.message : "Failed to send message",
        );
      }
    } finally {
      abortControllerRef.current = null;
      setChatLoading(false);
    }
  };

  const cancelMessage = () => {
    abortControllerRef.current?.abort();
  };

  return {
    messageInput,
    setMessageInput,
    chatLoading,
    chatError,
    contextExpanded,
    setContextExpanded,
    lastContextPaths,
    lastMemoryContextPaths,
    activeSkills,
    traceHistory,
    sendMessage,
    cancelMessage,
  };
}
