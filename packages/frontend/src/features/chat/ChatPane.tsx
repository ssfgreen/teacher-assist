import {
  BarChart3,
  ChevronDown,
  Loader2,
  Plus,
  Send,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage, ChatTrace, Provider } from "../../types";
import { displayContextPath } from "../workspace/path-utils";
import { AssistantMessage } from "./AssistantMessage";
import { MODEL_OPTIONS } from "./model-options";

type TimelineEntryKind =
  | "user-prompt"
  | "context-added"
  | "model-response"
  | "skill-read"
  | "tool-step"
  | "tool-group"
  | "final-model-response";

interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  message?: ChatMessage;
  workspacePaths?: string[];
  memoryPaths?: string[];
  trace?: ChatTrace;
  groupLabel?: string;
  groupMessages?: ChatMessage[];
}

interface ChatPaneProps {
  classRefs: string[];
  selectedClassRef: string;
  setSelectedClassRef: (value: string) => void;
  contextHistory: string[][];
  memoryContextHistory: string[][];
  traceHistory: ChatTrace[];
  messages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  sessionError: string | null;
  messageInput: string;
  setMessageInput: (value: string) => void;
  focusComposerToken: number;
  sessionLoading: boolean;
  provider: Provider;
  model: string;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  onInspectSkill: (skillName: string) => void;
  onInspectWorkspacePath: (path: string) => void;
  onInspectMemoryPath: (path: string) => void;
  onInspectPrompt: (prompt: string, label: string) => void;
  onInspectRawResponse: (content: string, label: string) => void;
  sendMessage: () => Promise<void>;
  cancelMessage: () => void;
}

function toolMessageSignature(message: ChatMessage): string {
  return `${message.toolName ?? "tool"}|${JSON.stringify(
    message.toolInput ?? {},
  )}|${message.toolError ? "1" : "0"}|${message.content}`;
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
  memoryContextHistory: string[][],
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
  const memoryByTurn = alignByTurn<string[]>(
    userIndices.length,
    memoryContextHistory,
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

    const workspacePaths = contextsByTurn[turnIndex];
    const memoryPaths = memoryByTurn[turnIndex];
    const turnTrace = tracesByTurn[turnIndex];

    if (workspacePaths.length > 0 || memoryPaths.length > 0) {
      entries.push({
        id: `turn-${turnIndex}-context`,
        kind: "context-added",
        workspacePaths,
        memoryPaths,
        trace: turnTrace,
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

    const toolGroupCategory = (
      message: ChatMessage,
    ): "skills" | "files" | "other" => {
      if (message.toolName === "read_skill") {
        return "skills";
      }
      if (
        message.toolName === "read_file" ||
        message.toolName === "list_directory" ||
        message.toolName === "write_file" ||
        message.toolName === "str_replace"
      ) {
        return "files";
      }
      return "other";
    };

    const toolGroupLabel = (category: "skills" | "files" | "other"): string => {
      if (category === "skills") {
        return "Reading skills";
      }
      if (category === "files") {
        return "Exploring files";
      }
      return "Using tools";
    };

    for (
      let turnMessageIndex = 0;
      turnMessageIndex < turnMessages.length;
      turnMessageIndex += 1
    ) {
      const message = turnMessages[turnMessageIndex];

      if (message.role === "tool") {
        const start = turnMessageIndex;
        const firstCategory = toolGroupCategory(message);
        const groupedMessages: ChatMessage[] = [message];
        let end = start;

        for (
          let lookahead = start + 1;
          lookahead < turnMessages.length;
          lookahead += 1
        ) {
          const nextMessage = turnMessages[lookahead];
          if (nextMessage.role !== "tool") {
            break;
          }
          if (toolGroupCategory(nextMessage) !== firstCategory) {
            break;
          }
          groupedMessages.push(nextMessage);
          end = lookahead;
        }

        const dedupedGroupedMessages = groupedMessages.filter(
          (candidate, index, list) =>
            index === 0 ||
            toolMessageSignature(candidate) !==
              toolMessageSignature(list[index - 1]),
        );

        if (dedupedGroupedMessages.length > 1 && firstCategory !== "other") {
          entries.push({
            id: `turn-${turnIndex}-tool-group-${start}`,
            kind: "tool-group",
            groupLabel: toolGroupLabel(firstCategory),
            groupMessages: dedupedGroupedMessages,
            trace: turnTrace,
          });
          turnMessageIndex = end;
          continue;
        }

        const messageToRender = dedupedGroupedMessages[0] ?? message;
        entries.push({
          id: `turn-${turnIndex}-tool-${turnMessageIndex}`,
          kind:
            messageToRender.toolName === "read_skill"
              ? "skill-read"
              : "tool-step",
          message: messageToRender,
          trace: turnTrace,
        });
        continue;
      }

      if (message.role !== "assistant" && message.role !== "system") {
        continue;
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
        trace: turnTrace,
      });
    }
  }

  return entries;
}

function entryContainerClasses(kind: TimelineEntryKind): string {
  if (kind === "user-prompt") {
    return "ml-auto max-w-[85%] bg-accent-500 text-white";
  }

  if (kind === "final-model-response") {
    return "mr-auto max-w-[90%] bg-paper-100";
  }

  if (kind === "model-response") {
    return "mr-auto max-w-[90%] bg-surface-muted";
  }

  return "mr-auto max-w-[90%] bg-paper-100";
}

function toolPreview(message: ChatMessage): string {
  if (message.toolName === "read_skill") {
    const target =
      typeof message.toolInput?.target === "string"
        ? message.toolInput.target
        : "skill";
    return `Read Skill: ${target}`;
  }

  if (message.toolName === "read_file") {
    const path =
      typeof message.toolInput?.path === "string" ? message.toolInput.path : "";
    return `Read File${path ? `: ${path}` : ""}`;
  }

  if (message.toolName === "write_file") {
    const path =
      typeof message.toolInput?.path === "string" ? message.toolInput.path : "";
    return `Write File${path ? `: ${path}` : ""}`;
  }

  return `${message.toolName ?? "tool"}`;
}

function skillTarget(message: ChatMessage): string | null {
  const target = message.toolInput?.target;
  return typeof target === "string" ? target : null;
}

function readFilePath(message: ChatMessage): string | null {
  if (message.toolName !== "read_file") {
    return null;
  }
  const path = message.toolInput?.path;
  return typeof path === "string" ? path : null;
}

function isMemoryPath(path: string): boolean {
  return path === "MEMORY.md" || path.endsWith("/MEMORY.md");
}

function summaryText(entry: TimelineEntry, pending: boolean): string {
  if (pending) {
    return "Thinking...";
  }

  if (entry.kind === "context-added") {
    return "Prompt Embellished: Context added";
  }

  if (entry.kind === "skill-read" || entry.kind === "tool-step") {
    return entry.message ? toolPreview(entry.message) : "Tool executed";
  }

  if (entry.kind === "tool-group") {
    return entry.groupLabel ?? "Using tools";
  }

  if (entry.kind === "model-response") {
    return "Drafting response";
  }

  if (entry.kind === "final-model-response") {
    return "Assistant response";
  }

  return entry.message?.content || "User prompt";
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
    entry.message?.role !== "user" &&
    entryIndex === entries.length - 1
  );
}

function tokensTitle(trace?: ChatTrace): string {
  if (!trace) {
    return "No token data";
  }

  return `Prompt: ${trace.usage.inputTokens}, Response: ${trace.usage.outputTokens}, Total: ${trace.usage.totalTokens}`;
}

function promptLabel(trace: ChatTrace): string {
  const timestamp = new Date(trace.createdAt).toLocaleString();
  return `System prompt (${timestamp})`;
}

function responseLabel(trace?: ChatTrace): string {
  if (!trace) {
    return "Raw response";
  }
  const timestamp = new Date(trace.createdAt).toLocaleString();
  return `Raw response (${timestamp})`;
}

export default function ChatPane({
  classRefs,
  selectedClassRef,
  setSelectedClassRef,
  contextHistory,
  memoryContextHistory,
  traceHistory,
  messages,
  chatLoading,
  chatError,
  sessionError,
  messageInput,
  setMessageInput,
  focusComposerToken,
  sessionLoading,
  provider,
  model,
  setProvider,
  setModel,
  onInspectSkill,
  onInspectWorkspacePath,
  onInspectMemoryPath,
  onInspectPrompt,
  onInspectRawResponse,
  sendMessage,
  cancelMessage,
}: ChatPaneProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  const resizeComposer = useCallback(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 240)}px`;
  }, []);

  const entries = useMemo(
    () =>
      buildTimelineEntries(
        messages,
        contextHistory,
        memoryContextHistory,
        traceHistory,
      ),
    [messages, contextHistory, memoryContextHistory, traceHistory],
  );

  const freshSlate = entries.length === 0 && !chatLoading;
  const composerExpanded =
    isComposerFocused || Boolean(messageInput.trim()) || chatLoading;
  const latestEntryId = entries.at(-1)?.id ?? "";
  const inspectFilePath = useCallback(
    (path: string) => {
      if (isMemoryPath(path)) {
        onInspectMemoryPath(path);
        return;
      }
      onInspectWorkspacePath(path);
    },
    [onInspectMemoryPath, onInspectWorkspacePath],
  );

  useEffect(() => {
    const token = focusComposerToken;
    const timer = window.setTimeout(() => {
      if (token >= 0) {
        composerRef.current?.focus();
        resizeComposer();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusComposerToken, resizeComposer]);

  useEffect(() => {
    const element = timelineRef.current;
    if (!element) {
      return;
    }

    const updateStickiness = () => {
      const distanceToBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldAutoScrollRef.current = distanceToBottom < 48;
    };

    updateStickiness();
    element.addEventListener("scroll", updateStickiness);
    return () => element.removeEventListener("scroll", updateStickiness);
  }, []);

  useEffect(() => {
    const element = timelineRef.current;
    if (!element || !shouldAutoScrollRef.current) {
      return;
    }
    if (!latestEntryId && !chatLoading) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [latestEntryId, chatLoading]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${freshSlate ? "justify-center" : ""}`}
    >
      {!freshSlate ? (
        <div
          ref={timelineRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-paper-300 bg-surface-muted p-3"
        >
          {entries.map((entry, entryIndex) => {
            const isPendingFinalResponse = isPendingFinalResponseEntry(
              entry,
              entryIndex,
              entries,
              chatLoading,
            );

            if (entry.kind === "user-prompt") {
              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl border px-3 py-2 text-sm ${entryContainerClasses(entry.kind)}`}
                >
                  <p className="whitespace-pre-wrap text-sm">
                    {entry.message?.content}
                  </p>
                </div>
              );
            }

            if (entry.kind === "final-model-response") {
              return (
                <section
                  key={entry.id}
                  className={`mr-auto max-w-[90%] rounded-2xl border px-3 py-2 text-sm ${entryContainerClasses(entry.kind)}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">
                      {summaryText(entry, isPendingFinalResponse)}
                    </p>
                    {isPendingFinalResponse ? (
                      <Loader2 className="h-4 w-4 animate-spin text-ink-700" />
                    ) : null}
                    {entry.trace ? (
                      <span
                        aria-label={tokensTitle(entry.trace)}
                        title={tokensTitle(entry.trace)}
                      >
                        <BarChart3 className="h-4 w-4 text-ink-700" />
                      </span>
                    ) : null}
                    {entry.trace ? (
                      <button
                        className="rounded border border-paper-300 px-2 py-0.5 text-[11px] text-ink-700 hover:border-accent-500"
                        type="button"
                        onClick={() =>
                          onInspectPrompt(
                            entry.trace?.systemPrompt ?? "",
                            promptLabel(entry.trace),
                          )
                        }
                      >
                        View full prompt
                      </button>
                    ) : null}
                    <button
                      className="rounded border border-paper-300 px-2 py-0.5 text-[11px] text-ink-700 hover:border-accent-500"
                      type="button"
                      onClick={() =>
                        onInspectRawResponse(
                          entry.message?.content ?? "",
                          responseLabel(entry.trace),
                        )
                      }
                    >
                      View raw response
                    </button>
                  </div>
                  {entry.message?.role === "assistant" ||
                  entry.message?.role === "system" ? (
                    <AssistantMessage
                      content={
                        chatLoading && entryIndex === entries.length - 1
                          ? `${entry.message.content}▋`
                          : entry.message.content
                      }
                    />
                  ) : null}
                </section>
              );
            }

            if (
              entry.kind === "context-added" ||
              entry.kind === "skill-read" ||
              entry.kind === "tool-step" ||
              entry.kind === "tool-group" ||
              entry.kind === "model-response"
            ) {
              const plainSummary = summaryText(
                entry,
                isPendingFinalResponse,
              ).toLowerCase();
              return (
                <details
                  key={entry.id}
                  className="mr-auto max-w-[90%] text-xs text-ink-700"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-1">
                    <span className="min-w-0 truncate">{plainSummary}</span>
                    {entry.trace ? (
                      <span
                        aria-label={tokensTitle(entry.trace)}
                        title={tokensTitle(entry.trace)}
                      >
                        <BarChart3 className="h-3 w-3 text-ink-700/70" />
                      </span>
                    ) : null}
                    {isPendingFinalResponse ? (
                      <Loader2 className="h-3 w-3 animate-spin text-ink-700/70" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-ink-700/70" />
                    )}
                  </summary>
                  <div className="mt-1 border-l border-paper-300 pl-2">
                    {entry.kind === "context-added" ? (
                      <div className="space-y-2 text-xs">
                        {entry.trace ? (
                          <button
                            className="rounded border border-paper-300 px-2 py-0.5 text-[11px] hover:border-accent-500"
                            type="button"
                            onClick={() =>
                              onInspectPrompt(
                                entry.trace?.systemPrompt ?? "",
                                promptLabel(entry.trace),
                              )
                            }
                          >
                            View full prompt
                          </button>
                        ) : null}
                        <div>
                          <p className="font-semibold">Workspace context</p>
                          <ul className="mt-1 list-disc pl-4">
                            {(entry.workspacePaths ?? []).map((path) => (
                              <li key={path}>
                                <button
                                  className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                  type="button"
                                  onClick={() => onInspectWorkspacePath(path)}
                                >
                                  {displayContextPath(path)}
                                </button>
                              </li>
                            ))}
                            {(entry.workspacePaths ?? []).length === 0 ? (
                              <li>None</li>
                            ) : null}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold">
                            From previous sessions
                          </p>
                          <ul className="mt-1 list-disc pl-4">
                            {(entry.memoryPaths ?? []).map((path) => (
                              <li key={path}>
                                <button
                                  className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                  type="button"
                                  onClick={() => onInspectMemoryPath(path)}
                                >
                                  {displayContextPath(path)}
                                </button>
                              </li>
                            ))}
                            {(entry.memoryPaths ?? []).length === 0 ? (
                              <li>None</li>
                            ) : null}
                          </ul>
                        </div>
                      </div>
                    ) : null}

                    {entry.kind === "tool-group" ? (
                      <ul className="space-y-1 text-xs">
                        {(entry.groupMessages ?? []).map((message, index) => (
                          <li key={`${entry.id}-group-${index}`}>
                            {message.toolName === "read_skill" &&
                            skillTarget(message) ? (
                              <button
                                className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                type="button"
                                onClick={() =>
                                  onInspectSkill(skillTarget(message) ?? "")
                                }
                              >
                                {toolPreview(message).toLowerCase()}
                              </button>
                            ) : readFilePath(message) ? (
                              <button
                                className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                type="button"
                                onClick={() =>
                                  inspectFilePath(readFilePath(message) ?? "")
                                }
                              >
                                {toolPreview(message).toLowerCase()}
                              </button>
                            ) : (
                              toolPreview(message).toLowerCase()
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {(entry.kind === "skill-read" ||
                      entry.kind === "tool-step") &&
                    entry.message?.role === "tool" ? (
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="font-semibold">Tool</p>
                          {entry.message.toolName === "read_skill" &&
                          skillTarget(entry.message) ? (
                            <button
                              className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                              type="button"
                              onClick={() =>
                                onInspectSkill(skillTarget(entry.message) ?? "")
                              }
                            >
                              {entry.message.toolName}
                            </button>
                          ) : readFilePath(entry.message) ? (
                            <button
                              className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                              type="button"
                              onClick={() =>
                                inspectFilePath(
                                  readFilePath(entry.message) ?? "",
                                )
                              }
                            >
                              {entry.message.toolName}
                            </button>
                          ) : (
                            <p>{entry.message.toolName ?? "tool"}</p>
                          )}
                          {entry.message.toolError ? (
                            <p className="text-danger-700">Execution error</p>
                          ) : null}
                        </div>
                        <div>
                          <p className="font-semibold">Arguments</p>
                          <pre className="overflow-auto whitespace-pre-wrap rounded border border-paper-300 bg-surface-panel p-2">
                            {JSON.stringify(
                              entry.message.toolInput ?? {},
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                        {readFilePath(entry.message) ? null : (
                          <div>
                            <p className="font-semibold">Result</p>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-paper-300 bg-surface-panel p-2">
                              {entry.message.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            }
            return null;
          })}
        </div>
      ) : (
        <div />
      )}

      {(chatError || sessionError) && (
        <p className="mt-2 text-sm text-danger-700">
          {chatError ?? sessionError}
        </p>
      )}

      <form
        className={`mx-auto mt-3 w-full ${freshSlate ? "max-w-3xl" : "max-w-5xl"}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (chatLoading) {
            cancelMessage();
          } else {
            void sendMessage();
          }
        }}
      >
        <div
          className="grid border border-paper-300 bg-surface-main p-2.5 shadow-sm transition-all duration-200"
          style={{
            borderRadius: "28px",
            gridTemplateColumns: "auto minmax(0,1fr) auto",
            gridTemplateAreas: composerExpanded
              ? "'primary primary primary' 'leading footer trailing'"
              : "'leading primary trailing' 'leading footer trailing'",
          }}
        >
          <div className="flex items-end pb-1" style={{ gridArea: "leading" }}>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-paper-300 bg-surface-panel text-ink-700 transition hover:border-accent-500 hover:text-accent-600"
              aria-label="Add files and more"
              disabled
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <textarea
            ref={composerRef}
            rows={1}
            className="w-full min-h-[2.5rem] resize-none overflow-y-auto bg-transparent px-3 py-2 leading-6 outline-none"
            placeholder="Type your message..."
            value={messageInput}
            onChange={(event) => {
              setMessageInput(event.target.value);
              resizeComposer();
            }}
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
            onFocus={() => setIsComposerFocused(true)}
            onBlur={() => setIsComposerFocused(false)}
            disabled={chatLoading || sessionLoading}
            style={{ gridArea: "primary" }}
          />

          <div
            className="flex items-end justify-end pb-1"
            style={{ gridArea: "trailing" }}
          >
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-surface-panel disabled:opacity-60"
              type="submit"
              aria-label={chatLoading ? "Stop generation" : "Send message"}
              disabled={
                sessionLoading || (!chatLoading && !messageInput.trim())
              }
            >
              {chatLoading ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>

          <div
            className={`mt-1 overflow-x-auto transition-all duration-200 ${composerExpanded ? "opacity-100" : "opacity-85"}`}
            style={{ gridArea: "footer" }}
          >
            <div className="flex min-w-fit items-center gap-2 px-1 text-xs text-ink-700">
              <label className="sr-only" htmlFor="provider">
                Provider
              </label>
              <select
                id="provider"
                className="rounded-full border border-paper-300 bg-surface-panel px-3 py-1 text-xs"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as Provider)
                }
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>

              <label className="sr-only" htmlFor="model">
                Model
              </label>
              <select
                id="model"
                className="rounded-full border border-paper-300 bg-surface-panel px-3 py-1 text-xs"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {MODEL_OPTIONS[provider].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="classRef">
                Class context
              </label>
              <select
                id="classRef"
                className="rounded-full border border-paper-300 bg-surface-panel px-3 py-1 text-xs"
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
          </div>
        </div>
      </form>
    </div>
  );
}
