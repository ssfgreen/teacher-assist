import { useEffect, useRef, useState } from "react";

import {
  sendAdjudicationResponse,
  sendChatStream,
  sendFeedforwardResponse,
  sendQuestionResponse,
} from "../../api/chat";
import { useMemoryStore } from "../../stores/memoryStore";
import type {
  ChatApiResponse,
  ChatMessage,
  ChatTrace,
  SessionRecord,
} from "../../types";

interface UseChatSessionParams {
  currentSession: SessionRecord | null;
  provider: "anthropic" | "openai";
  model: string;
  selectedCommandId: string;
  selectedClassRef: string;
  createNewSession: () => Promise<SessionRecord>;
  upsertCurrentSession: (session: SessionRecord) => void;
  refreshSessions: () => Promise<void>;
}

type InteractiveState =
  | {
      kind: "feedforward";
      sessionId: string;
      summary: string;
    }
  | {
      kind: "reflection";
      sessionId: string;
      prompt: string;
    }
  | {
      kind: "adjudication";
      sessionId: string;
      sections: Array<{ id: string; title: string; preview: string }>;
    }
  | {
      kind: "question";
      sessionId: string;
      question: string;
      options: string[];
      allowFreeText: boolean;
    }
  | null;

export function useChatSession({
  currentSession,
  provider,
  model,
  selectedCommandId,
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
  const [interactiveState, setInteractiveState] =
    useState<InteractiveState>(null);
  const [interactiveInput, setInteractiveInput] = useState("");

  useEffect(() => {
    if (previousSessionIdRef.current === currentSessionId) {
      return;
    }

    previousSessionIdRef.current = currentSessionId;
    setTraceHistory(currentSession?.traceHistory ?? []);
    setLastContextPaths(currentSession?.contextHistory?.[0] ?? []);
    setLastMemoryContextPaths(currentSession?.memoryContextHistory?.[0] ?? []);
    setActiveSkills(currentSession?.activeSkills ?? []);
    setInteractiveState(null);
    setInteractiveInput("");
  }, [currentSession, currentSessionId]);

  const applyChatResponse = (
    response: ChatApiResponse,
    activeSession: SessionRecord,
    previewTrace: ChatTrace | null,
  ) => {
    upsertCurrentSession({
      ...activeSession,
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

    if (response.status === "awaiting_feedforward" && response.feedforward) {
      setInteractiveState({
        kind: "feedforward",
        sessionId: response.sessionId,
        summary: response.feedforward.summary,
      });
      return;
    }
    if (response.status === "awaiting_reflection" && response.reflection) {
      setInteractiveState({
        kind: "reflection",
        sessionId: response.sessionId,
        prompt: response.reflection.prompt,
      });
      return;
    }
    if (response.status === "awaiting_adjudication" && response.adjudication) {
      setInteractiveState({
        kind: "adjudication",
        sessionId: response.sessionId,
        sections: response.adjudication.sections,
      });
      return;
    }
    if (response.status === "awaiting_user_question" && response.question) {
      setInteractiveState({
        kind: "question",
        sessionId: response.sessionId,
        question: response.question.question,
        options: response.question.options ?? [],
        allowFreeText: response.question.allow_free_text,
      });
      return;
    }
    setInteractiveState(null);
  };

  const sendMessage = async () => {
    const content = messageInput.trim();
    if (!content || chatLoading || interactiveState) {
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
          command: selectedCommandId || undefined,
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

      applyChatResponse(response, streamBaseSession, previewTrace);
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

  const runInteractiveAction = async (
    action: () => Promise<ChatApiResponse>,
  ) => {
    if (chatLoading || !currentSession) {
      return;
    }
    setChatLoading(true);
    setChatError(null);
    try {
      const response = await action();
      applyChatResponse(response, currentSession, null);
      setInteractiveInput("");
      await refreshSessions();
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Failed interactive action",
      );
    } finally {
      setChatLoading(false);
    }
  };

  const submitFeedforward = async (
    action: "confirm" | "edit" | "dismiss",
    note?: string,
  ) => {
    if (interactiveState?.kind !== "feedforward") {
      return;
    }
    await runInteractiveAction(() =>
      sendFeedforwardResponse({
        sessionId: interactiveState.sessionId,
        action,
        note,
      }),
    );
  };

  const submitReflection = async (action: "acknowledge" | "skip") => {
    if (interactiveState?.kind !== "reflection") {
      return;
    }
    await runInteractiveAction(() =>
      sendAdjudicationResponse({
        sessionId: interactiveState.sessionId,
        action,
      }),
    );
  };

  const submitAdjudication = async (
    action: "accept" | "revise" | "alternatives",
    note?: string,
  ) => {
    if (interactiveState?.kind !== "adjudication") {
      return;
    }
    await runInteractiveAction(() =>
      sendAdjudicationResponse({
        sessionId: interactiveState.sessionId,
        action,
        note,
      }),
    );
  };

  const submitQuestion = async (answer: string) => {
    if (interactiveState?.kind !== "question") {
      return;
    }
    await runInteractiveAction(() =>
      sendQuestionResponse({
        sessionId: interactiveState.sessionId,
        answer,
      }),
    );
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
    interactiveState,
    interactiveInput,
    setInteractiveInput,
    sendMessage,
    submitFeedforward,
    submitReflection,
    submitAdjudication,
    submitQuestion,
    cancelMessage,
  };
}
