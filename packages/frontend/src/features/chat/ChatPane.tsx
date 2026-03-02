import { useEffect, useMemo, useRef } from "react";

import type { ChatMessage, ChatTrace } from "../../types";
import { displayContextPath } from "../workspace/path-utils";
import { AssistantMessage } from "./AssistantMessage";

type TimelineEntryKind =
  | "user-prompt"
  | "context-added"
  | "model-response"
  | "skill-read"
  | "tool-step"
  | "final-model-response";

interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  message?: ChatMessage;
  contextPaths?: string[];
  trace?: ChatTrace;
}

interface ChatPaneProps {
  classRefs: string[];
  selectedClassRef: string;
  setSelectedClassRef: (value: string) => void;
  contextHistory: string[][];
  traceHistory: ChatTrace[];
  messages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  sessionError: string | null;
  messageInput: string;
  setMessageInput: (value: string) => void;
  focusComposerToken: number;
  sessionLoading: boolean;
  sendMessage: () => Promise<void>;
}

function alignByTurn<T>(
  turnCount: number,
  newestFirstValues: T[],
  emptyValue: T,
): T[] {
  const aligned = Array.from({ length: turnCount }, () => emptyValue);
  const chronological = [...newestFirstValues].reverse();
  const start = Math.max(0, turnCount - chronological.length);

  for (let i = 0; i < chronological.length && start + i < turnCount; i += 1) {
    aligned[start + i] = chronological[i];
  }

  return aligned;
}

function buildTimelineEntries(
  messages: ChatMessage[],
  contextHistory: string[][],
  traceHistory: ChatTrace[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const userIndices = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user")
    .map(({ index }) => index);

  const contextsByTurn = alignByTurn<string[]>(
    userIndices.length,
    contextHistory,
    [],
  );
  const tracesByTurn = alignByTurn<ChatTrace | undefined>(
    userIndices.length,
    traceHistory,
    undefined,
  );

  for (let turnIndex = 0; turnIndex < userIndices.length; turnIndex += 1) {
    const userMessageIndex = userIndices[turnIndex];
    const nextUserMessageIndex = userIndices[turnIndex + 1] ?? messages.length;
    const userMessage = messages[userMessageIndex];

    entries.push({
      id: `turn-${turnIndex}-user`,
      kind: "user-prompt",
      message: userMessage,
    });

    const contextPaths = contextsByTurn[turnIndex];
    if (contextPaths.length > 0) {
      entries.push({
        id: `turn-${turnIndex}-context`,
        kind: "context-added",
        contextPaths,
        trace: tracesByTurn[turnIndex],
      });
    }

    const turnMessages = messages.slice(
      userMessageIndex + 1,
      nextUserMessageIndex,
    );
    const toolPositions = turnMessages.reduce<number[]>(
      (acc, message, index) => {
        if (message.role === "tool") {
          acc.push(index);
        }
        return acc;
      },
      [],
    );

    const firstToolPosition = toolPositions[0] ?? -1;
    const lastToolPosition = toolPositions[toolPositions.length - 1] ?? -1;

    turnMessages.forEach((message, turnMessageIndex) => {
      if (message.role === "tool") {
        entries.push({
          id: `turn-${turnIndex}-tool-${turnMessageIndex}`,
          kind: message.toolName === "read_skill" ? "skill-read" : "tool-step",
          message,
        });
        return;
      }

      if (message.role !== "assistant") {
        return;
      }

      const hasTools = toolPositions.length > 0;
      const isFinalWithTools = hasTools && turnMessageIndex > lastToolPosition;
      const isIntermediateWithTools =
        hasTools && turnMessageIndex <= firstToolPosition;

      entries.push({
        id: `turn-${turnIndex}-assistant-${turnMessageIndex}`,
        kind:
          hasTools && isIntermediateWithTools && !isFinalWithTools
            ? "model-response"
            : "final-model-response",
        message,
        trace: tracesByTurn[turnIndex],
      });
    });
  }

  return entries;
}

function bubbleClasses(kind: TimelineEntryKind): string {
  if (kind === "user-prompt") {
    return "ml-auto bg-accent-600 text-white";
  }

  if (kind === "final-model-response") {
    return "bg-[#d3f5ef] text-ink-900";
  }

  if (kind === "model-response") {
    return "ml-4 bg-[#e9fbf7] text-ink-900 opacity-90";
  }

  if (
    kind === "context-added" ||
    kind === "skill-read" ||
    kind === "tool-step"
  ) {
    return "ml-4 bg-[#f4ead8] text-ink-900 opacity-90";
  }

  return "bg-paper-50 text-ink-900";
}

function bubbleLabel(kind: TimelineEntryKind): string {
  if (kind === "user-prompt") {
    return "User prompt";
  }
  if (kind === "context-added") {
    return "Context added";
  }
  if (kind === "model-response") {
    return "Model response";
  }
  if (kind === "skill-read") {
    return "Skill read";
  }
  if (kind === "final-model-response") {
    return "Final model response";
  }
  return "Tool step";
}

function toolPreview(message: ChatMessage): string {
  if (message.toolName === "read_skill") {
    const target =
      typeof message.toolInput?.target === "string"
        ? message.toolInput.target
        : "skill";
    return `read_skill ${target}`;
  }

  if (message.toolName === "read_file" || message.toolName === "write_file") {
    const path =
      typeof message.toolInput?.path === "string" ? message.toolInput.path : "";
    return `${message.toolName}${path ? ` ${path}` : ""}`;
  }

  return message.toolName ?? "tool";
}

function isPendingFinalResponseEntry(
  entry: TimelineEntry,
  entryIndex: number,
  entries: TimelineEntry[],
  chatLoading: boolean,
): boolean {
  if (!chatLoading) {
    return false;
  }

  return (
    entry.kind === "final-model-response" &&
    entry.message?.role === "assistant" &&
    !entry.message.content.trim() &&
    entryIndex === entries.length - 1
  );
}

export default function ChatPane({
  classRefs,
  selectedClassRef,
  setSelectedClassRef,
  contextHistory,
  traceHistory,
  messages,
  chatLoading,
  chatError,
  sessionError,
  messageInput,
  setMessageInput,
  focusComposerToken,
  sessionLoading,
  sendMessage,
}: ChatPaneProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const entries = useMemo(
    () => buildTimelineEntries(messages, contextHistory, traceHistory),
    [messages, contextHistory, traceHistory],
  );

  useEffect(() => {
    const token = focusComposerToken;
    const timer = window.setTimeout(() => {
      if (token >= 0) {
        composerRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusComposerToken]);

  return (
    <div className="flex h-[70vh] min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-paper-100 p-2">
        <label className="text-xs text-ink-800" htmlFor="classRef">
          Class context
        </label>
        <select
          id="classRef"
          className="rounded border border-paper-100 px-2 py-1 text-xs"
          value={selectedClassRef}
          onChange={(event) => setSelectedClassRef(event.target.value)}
        >
          <option value="">Auto-detect</option>
          {classRefs.map((ref) => (
            <option key={ref} value={ref}>
              {ref}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-paper-100 p-3">
        {entries.map((entry, entryIndex) => {
          const isPendingFinalResponse = isPendingFinalResponseEntry(
            entry,
            entryIndex,
            entries,
            chatLoading,
          );

          return (
            <details
              key={entry.id}
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${bubbleClasses(entry.kind)}`}
            >
              <summary className="cursor-pointer list-none">
                <p className="text-xs font-semibold tracking-wide">
                  {isPendingFinalResponse
                    ? "Thinking"
                    : bubbleLabel(entry.kind)}
                </p>
                {entry.message ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {isPendingFinalResponse ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-900/30 border-t-ink-900"
                          aria-hidden
                        />
                        <span>Thinking...</span>
                      </span>
                    ) : entry.kind === "skill-read" ||
                      entry.kind === "tool-step" ? (
                      toolPreview(entry.message)
                    ) : entry.kind === "final-model-response" ? (
                      entry.message.content || "(empty)"
                    ) : (
                      entry.message.content.slice(0, 160) || "(empty)"
                    )}
                  </p>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    Context loaded for this prompt.
                  </p>
                )}
              </summary>
              <div className="mt-2 space-y-2 rounded-lg border border-paper-100/60 bg-white/60 p-2">
                {entry.kind === "context-added" ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold">Context Files</p>
                      <ul className="mt-1 list-disc pl-4 text-xs">
                        {(entry.contextPaths ?? []).map((path) => (
                          <li key={path}>{displayContextPath(path)}</li>
                        ))}
                      </ul>
                    </div>
                    {entry.trace ? (
                      <>
                        <div className="space-y-1 text-xs text-ink-800">
                          <p className="font-semibold">Call Tokens</p>
                          <p>Prompt tokens: {entry.trace.usage.inputTokens}</p>
                          <p>
                            Response tokens: {entry.trace.usage.outputTokens}
                          </p>
                          <p>Total tokens: {entry.trace.usage.totalTokens}</p>
                        </div>
                        <details className="rounded border border-paper-100 bg-white p-2">
                          <summary className="cursor-pointer font-medium">
                            Full prompt
                          </summary>
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">
                            {entry.trace.systemPrompt}
                          </pre>
                        </details>
                      </>
                    ) : null}
                  </>
                ) : null}

                {isPendingFinalResponse ? (
                  <p className="inline-flex items-center gap-2 whitespace-pre-wrap text-sm">
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-900/30 border-t-ink-900"
                      aria-hidden
                    />
                    <span>Thinking...</span>
                  </p>
                ) : null}

                {entry.message?.role === "assistant" &&
                !isPendingFinalResponse ? (
                  <AssistantMessage content={entry.message.content} />
                ) : null}

                {entry.message?.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm">
                    {entry.message.content}
                  </p>
                ) : null}

                {entry.message?.role === "tool" ? (
                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="font-semibold">Tool</p>
                      <p>{entry.message.toolName ?? "tool"}</p>
                      {entry.message.toolError ? (
                        <p className="text-red-700">Execution error</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="font-semibold">Arguments</p>
                      <pre className="overflow-auto whitespace-pre-wrap rounded border border-paper-100 bg-white p-2">
                        {JSON.stringify(entry.message.toolInput ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-semibold">Result</p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-paper-100 bg-white p-2">
                        {entry.message.content}
                      </pre>
                    </div>
                  </div>
                ) : null}

                {entry.kind === "final-model-response" && entry.trace ? (
                  <div className="space-y-1 text-xs text-ink-800">
                    <p className="font-semibold">Call Details</p>
                    <p>Status: {entry.trace.status}</p>
                    <p>Prompt tokens: {entry.trace.usage.inputTokens}</p>
                    <p>Response tokens: {entry.trace.usage.outputTokens}</p>
                    <p>Total tokens: {entry.trace.usage.totalTokens}</p>
                  </div>
                ) : null}
              </div>
            </details>
          );
        })}
        {chatLoading ? (
          <p className="text-sm text-ink-800">Assistant is responding...</p>
        ) : null}
        {entries.length === 0 ? (
          <p className="text-sm text-ink-800">Start a conversation to begin.</p>
        ) : null}
      </div>

      {(chatError || sessionError) && (
        <p className="mb-2 text-sm text-red-700">{chatError ?? sessionError}</p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          ref={composerRef}
          className="min-h-24 flex-1 rounded-lg border border-paper-100 px-3 py-2"
          placeholder="Type your message..."
          value={messageInput}
          onChange={(event) => setMessageInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          disabled={chatLoading || sessionLoading}
        />
        <button
          className="rounded-lg bg-accent-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={chatLoading || sessionLoading || !messageInput.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
