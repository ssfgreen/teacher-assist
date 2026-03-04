import {
  BarChart3,
  ChevronDown,
  Eye,
  Loader2,
  Plus,
  Search,
  Send,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ApprovalMode,
  ChatMessage,
  ChatTrace,
  CommandSummary,
  Provider,
} from "../../types";
import { displayContextPath } from "../workspace/path-utils";
import { AssistantMessage } from "./AssistantMessage";
import InteractiveCard from "./InteractiveCard";
import { SubagentDelegationCard } from "./SubagentDelegationCard";
import { MODEL_OPTIONS } from "./model-options";

type TimelineEntryKind =
  | "user-prompt"
  | "context-added"
  | "model-response"
  | "skill-read"
  | "tool-step"
  | "delegation"
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
  commands: CommandSummary[];
  selectedCommandId: string;
  setSelectedCommandId: (value: string) => void;
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
  approvalMode: ApprovalMode;
  setApprovalMode: (mode: ApprovalMode) => void;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  onInspectSkill: (skillName: string) => void;
  onInspectWorkspacePath: (path: string) => void;
  onInspectMemoryPath: (path: string) => void;
  onInspectReadFileTool: (message: ChatMessage) => void;
  onInspectPrompt: (prompt: string, label: string) => void;
  onInspectRawResponse: (content: string, label: string) => void;
  sendMessage: () => Promise<void>;
  cancelMessage: () => void;
  interactiveLocked?: boolean;
  interactiveState:
    | {
        kind: "feedforward";
        summary: string;
      }
    | {
        kind: "reflection";
        prompt: string;
      }
    | {
        kind: "adjudication";
        sections: Array<{ id: string; title: string; preview: string }>;
      }
    | {
        kind: "question";
        question: string;
        options: string[];
        allowFreeText: boolean;
      }
    | {
        kind: "approval";
        question: string;
        options: string[];
        allowFreeText: boolean;
        approvalKind: "tool_call" | "skill_selection";
        skills: string[];
        contextSelection?: {
          optional: Array<{
            id: string;
            label: string;
            kind: "workspace" | "memory";
            path?: string;
          }>;
          required: Array<{
            id: string;
            label: string;
            kind: "workspace" | "system";
            path?: string;
          }>;
        };
      }
    | null;
  interactiveInput: string;
  setInteractiveInput: (value: string) => void;
  onFeedforward: (
    action: "confirm" | "edit" | "dismiss",
    note?: string,
  ) => void;
  onReflection: (action: "acknowledge" | "skip") => void;
  onAdjudication: (
    action: "accept" | "revise" | "alternatives",
    note?: string,
  ) => void;
  onQuestion: (answer: string) => void;
  onApproval: (
    decision:
      | "approve"
      | "always_allow"
      | "deny"
      | "approve_selected"
      | "deny_all",
    selectedSkills?: string[],
    alternateResponse?: string,
    selectedContextIds?: string[],
  ) => void;
}

function toolMessageSignature(message: ChatMessage): string {
  return `${message.toolName ?? "tool"}|${JSON.stringify(
    message.toolInput ?? {},
  )}|${message.toolError ? "1" : "0"}|${message.content}`;
}

function readOnceToolSignature(message: ChatMessage): string | null {
  if (message.role !== "tool") {
    return null;
  }

  if (
    message.toolName !== "read_file" &&
    message.toolName !== "read_skill" &&
    message.toolName !== "read_memory" &&
    message.toolName !== "list_directory"
  ) {
    return null;
  }

  return `${message.toolName ?? "tool"}|${JSON.stringify(
    message.toolInput ?? {},
  )}`;
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

function normalizePathList(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

function samePathList(a: string[], b: string[]): boolean {
  const left = normalizePathList(a);
  const right = normalizePathList(b);
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
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

    const hasContext = workspacePaths.length > 0 || memoryPaths.length > 0;
    const prevWorkspacePaths =
      turnIndex > 0 ? contextsByTurn[turnIndex - 1] : [];
    const prevMemoryPaths = turnIndex > 0 ? memoryByTurn[turnIndex - 1] : [];
    const contextChanged =
      turnIndex === 0 ||
      !samePathList(workspacePaths, prevWorkspacePaths) ||
      !samePathList(memoryPaths, prevMemoryPaths);

    if (hasContext && contextChanged) {
      entries.push({
        id: `turn-${turnIndex}-context`,
        kind: "context-added",
        workspacePaths,
        memoryPaths,
        trace: turnTrace,
      });
    }

    const rawTurnMessages = messages.slice(
      userMessageIndex + 1,
      nextUserMessageIndex,
    );
    const seenReadOnceTools = new Set<string>();
    const turnMessages = rawTurnMessages.filter((message) => {
      const signature = readOnceToolSignature(message);
      if (!signature) {
        return true;
      }
      if (seenReadOnceTools.has(signature)) {
        return false;
      }
      seenReadOnceTools.add(signature);
      return true;
    });
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
        if (message.toolName === "spawn_subagent") {
          entries.push({
            id: `turn-${turnIndex}-delegation-${turnMessageIndex}`,
            kind: "delegation",
            message,
            trace: turnTrace,
          });
          continue;
        }

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

  if (entry.kind === "delegation") {
    const agent =
      typeof entry.message?.toolMetadata?.agent === "string"
        ? entry.message.toolMetadata.agent
        : "subagent";
    return `Delegated to ${agent}`;
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

function TokenUsageIcon({
  trace,
  compact = false,
}: { trace: ChatTrace; compact?: boolean }) {
  const tooltip = tokensTitle(trace);
  const iconSizeClass = compact ? "h-3 w-3" : "h-4 w-4";

  return (
    <span
      className="group relative inline-flex items-center"
      aria-label={tooltip}
      title={tooltip}
    >
      <BarChart3 className={`${iconSizeClass} text-ink-700`} />
      <span className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded border border-paper-300 bg-surface-panel px-2 py-1 text-[11px] text-ink-900 shadow group-hover:block">
        {tooltip}
      </span>
    </span>
  );
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

function activityLabel(entries: TimelineEntry[], chatLoading: boolean): string {
  if (!chatLoading && entries.length === 0) {
    return "Idle";
  }

  const latestTool = [...entries]
    .reverse()
    .find(
      (entry) =>
        (entry.kind === "tool-step" || entry.kind === "delegation") &&
        entry.message?.role === "tool",
    );

  if (chatLoading && latestTool?.kind === "delegation") {
    const agent =
      typeof latestTool.message?.toolMetadata?.agent === "string"
        ? latestTool.message.toolMetadata.agent
        : "subagent";
    return `Active: ${agent} delegation`;
  }

  if (chatLoading) {
    return "Active: planner reasoning";
  }

  if (latestTool?.kind === "delegation") {
    const agent =
      typeof latestTool.message?.toolMetadata?.agent === "string"
        ? latestTool.message.toolMetadata.agent
        : "subagent";
    return `Last activity: delegated to ${agent}`;
  }

  return "Idle";
}

export default function ChatPane({
  classRefs,
  selectedClassRef,
  setSelectedClassRef,
  commands,
  selectedCommandId,
  setSelectedCommandId,
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
  approvalMode,
  setApprovalMode,
  setProvider,
  setModel,
  onInspectSkill,
  onInspectWorkspacePath,
  onInspectMemoryPath,
  onInspectReadFileTool,
  onInspectPrompt,
  onInspectRawResponse,
  sendMessage,
  cancelMessage,
  interactiveLocked = false,
  interactiveState,
  interactiveInput,
  setInteractiveInput,
  onFeedforward,
  onReflection,
  onAdjudication,
  onQuestion,
  onApproval,
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
  const latestEntryId =
    entries.length > 0 ? (entries[entries.length - 1]?.id ?? "") : "";
  const currentActivity = activityLabel(entries, chatLoading);

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
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">
                      {summaryText(entry, isPendingFinalResponse)}
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      {isPendingFinalResponse ? (
                        <Loader2 className="h-4 w-4 animate-spin text-ink-700" />
                      ) : null}
                      {entry.trace ? (
                        <TokenUsageIcon trace={entry.trace} />
                      ) : null}
                      {entry.trace ? (
                        <button
                          className="rounded border border-paper-300 px-2 py-0.5 text-[11px] text-ink-700 hover:border-accent-500"
                          type="button"
                          aria-label="View full prompt"
                          title="View full prompt"
                          onClick={() => {
                            const trace = entry.trace;
                            if (!trace) {
                              return;
                            }
                            onInspectPrompt(
                              trace.systemPrompt,
                              promptLabel(trace),
                            );
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        className="rounded border border-paper-300 px-2 py-0.5 text-[11px] text-ink-700 hover:border-accent-500"
                        type="button"
                        aria-label="View raw response"
                        title="View raw response"
                        onClick={() =>
                          onInspectRawResponse(
                            entry.message?.content ?? "",
                            responseLabel(entry.trace),
                          )
                        }
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {entry.message?.role === "assistant" ||
                  entry.message?.role === "system" ? (
                    <AssistantMessage
                      content={entry.message.content}
                      streaming={
                        chatLoading && entryIndex === entries.length - 1
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
              entry.kind === "delegation" ||
              entry.kind === "tool-group" ||
              entry.kind === "model-response"
            ) {
              if (
                entry.kind === "delegation" &&
                entry.message?.role === "tool"
              ) {
                return (
                  <SubagentDelegationCard
                    key={entry.id}
                    message={entry.message}
                    pending={isPendingFinalResponse}
                  />
                );
              }

              const plainSummary = summaryText(
                entry,
                isPendingFinalResponse,
              ).toLowerCase();

              if (
                entry.kind === "tool-step" &&
                entry.message?.role === "tool" &&
                readFilePath(entry.message)
              ) {
                const toolMessage = entry.message;
                return (
                  <button
                    key={entry.id}
                    className="mr-auto flex max-w-[90%] items-center gap-1 text-left text-xs text-ink-700"
                    type="button"
                    onClick={() => onInspectReadFileTool(toolMessage)}
                  >
                    <span className="min-w-0 truncate underline decoration-dotted underline-offset-2 hover:text-accent-700">
                      {plainSummary}
                    </span>
                    {entry.trace ? (
                      <TokenUsageIcon trace={entry.trace} compact />
                    ) : null}
                  </button>
                );
              }

              return (
                <details
                  key={entry.id}
                  className="mr-auto max-w-[90%] text-xs text-ink-700"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-1">
                    <span className="min-w-0 truncate">{plainSummary}</span>
                    {entry.trace ? (
                      <TokenUsageIcon trace={entry.trace} compact />
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
                            aria-label="View full prompt"
                            title="View full prompt"
                            onClick={() => {
                              const trace = entry.trace;
                              if (!trace) {
                                return;
                              }
                              onInspectPrompt(
                                trace.systemPrompt,
                                promptLabel(trace),
                              );
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
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
                                onClick={() => onInspectReadFileTool(message)}
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
                    entry.message?.role === "tool"
                      ? (() => {
                          const toolMessage = entry.message;
                          return (
                            <div className="space-y-2 text-xs">
                              <div>
                                <p className="font-semibold">Tool</p>
                                {toolMessage.toolName === "read_skill" &&
                                skillTarget(toolMessage) ? (
                                  <button
                                    className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                    type="button"
                                    onClick={() =>
                                      onInspectSkill(
                                        skillTarget(toolMessage) ?? "",
                                      )
                                    }
                                  >
                                    {toolMessage.toolName}
                                  </button>
                                ) : readFilePath(toolMessage) ? (
                                  <button
                                    className="underline decoration-dotted underline-offset-2 hover:text-accent-700"
                                    type="button"
                                    onClick={() =>
                                      onInspectReadFileTool(toolMessage)
                                    }
                                  >
                                    {toolMessage.toolName}
                                  </button>
                                ) : (
                                  <p>{toolMessage.toolName ?? "tool"}</p>
                                )}
                                {toolMessage.toolError ? (
                                  <p className="text-danger-700">
                                    Execution error
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <p className="font-semibold">Arguments</p>
                                <pre className="overflow-auto whitespace-pre-wrap rounded border border-paper-300 bg-surface-panel p-2">
                                  {JSON.stringify(
                                    toolMessage.toolInput ?? {},
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                              {readFilePath(toolMessage) ? null : (
                                <div>
                                  <p className="font-semibold">Result</p>
                                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-paper-300 bg-surface-panel p-2">
                                    {toolMessage.content}
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      : null}
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

      <InteractiveCard
        state={interactiveState}
        input={interactiveInput}
        setInput={setInteractiveInput}
        loading={chatLoading}
        onFeedforward={onFeedforward}
        onReflection={onReflection}
        onAdjudication={onAdjudication}
        onQuestion={onQuestion}
        onApproval={onApproval}
      />

      <div className="mt-2 flex items-center gap-2 px-1 text-xs text-ink-700">
        {chatLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-paper-400" />
        )}
        <span>{currentActivity}</span>
      </div>

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
            // Keep the composer grid stable on focus to prevent control/caret jumps.
            gridTemplateAreas:
              "'leading primary trailing' 'leading footer trailing'",
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
            disabled={chatLoading || sessionLoading || interactiveLocked}
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
                sessionLoading ||
                interactiveLocked ||
                (!chatLoading && !messageInput.trim())
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

              <label className="sr-only" htmlFor="approvalMode">
                Approval mode
              </label>
              <select
                id="approvalMode"
                className="rounded-full border border-paper-300 bg-surface-panel px-3 py-1 text-xs"
                value={approvalMode}
                onChange={(event) =>
                  setApprovalMode(event.target.value as ApprovalMode)
                }
              >
                <option value="feedforward">FeedForward</option>
                <option value="automation">Automation</option>
              </select>

              <label className="sr-only" htmlFor="command">
                Command
              </label>
              <select
                id="command"
                className="rounded-full border border-paper-300 bg-surface-panel px-3 py-1 text-xs"
                value={selectedCommandId}
                onChange={(event) => setSelectedCommandId(event.target.value)}
              >
                <option value="">No command</option>
                {commands.map((command) => (
                  <option key={command.id} value={command.id}>
                    {command.label}
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
