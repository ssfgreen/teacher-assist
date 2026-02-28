import type { ChatMessage, ChatTrace } from "../../types";
import { displayContextPath } from "../workspace/path-utils";
import { AssistantMessage } from "./AssistantMessage";
import { ToolCallMessage } from "./ToolCallMessage";

interface ChatPaneProps {
  classRefs: string[];
  selectedClassRef: string;
  setSelectedClassRef: (value: string) => void;
  lastContextPaths: string[];
  contextExpanded: boolean;
  setContextExpanded: (
    value: boolean | ((current: boolean) => boolean),
  ) => void;
  traceHistory: ChatTrace[];
  traceExpanded: boolean;
  setTraceExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  selectedTraceId: string | null;
  setSelectedTraceId: (id: string) => void;
  messages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  sessionError: string | null;
  messageInput: string;
  setMessageInput: (value: string) => void;
  sessionLoading: boolean;
  sendMessage: () => Promise<void>;
}

export default function ChatPane({
  classRefs,
  selectedClassRef,
  setSelectedClassRef,
  lastContextPaths,
  contextExpanded,
  setContextExpanded,
  traceHistory,
  traceExpanded,
  setTraceExpanded,
  selectedTraceId,
  setSelectedTraceId,
  messages,
  chatLoading,
  chatError,
  sessionError,
  messageInput,
  setMessageInput,
  sessionLoading,
  sendMessage,
}: ChatPaneProps) {
  const selectedTrace =
    traceHistory.find((trace) => trace.id === selectedTraceId) ??
    traceHistory[0] ??
    null;

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

      {lastContextPaths.length > 0 ? (
        <div className="mb-2 rounded-lg border border-paper-100 bg-paper-50 p-2 text-xs">
          <button
            className="text-left font-medium"
            type="button"
            onClick={() => setContextExpanded((value) => !value)}
          >
            Used context ({lastContextPaths.length})
          </button>
          {contextExpanded ? (
            <ul className="mt-2 list-disc pl-4">
              {lastContextPaths.map((path) => (
                <li key={path}>{displayContextPath(path)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {traceHistory.length > 0 ? (
        <div className="mb-2 rounded-lg border border-paper-100 bg-paper-50 p-2 text-xs">
          <button
            className="text-left font-medium"
            type="button"
            onClick={() => setTraceExpanded((value) => !value)}
          >
            Trace log ({traceHistory.length})
          </button>
          {traceExpanded ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {traceHistory.map((trace) => (
                  <button
                    key={trace.id}
                    className={`rounded border px-2 py-0.5 ${selectedTrace?.id === trace.id ? "border-accent-600 bg-white" : "border-paper-100 bg-paper-50"}`}
                    type="button"
                    onClick={() => setSelectedTraceId(trace.id)}
                  >
                    {new Date(trace.createdAt).toLocaleTimeString()}
                  </button>
                ))}
              </div>

              {selectedTrace ? (
                <div className="space-y-2">
                  <div>
                    <p className="font-medium">Generated prompt</p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-paper-100 bg-white p-2">
                      {selectedTrace.systemPrompt}
                    </pre>
                    <p className="mt-1 text-[11px] text-ink-800">
                      Estimated prompt tokens:{" "}
                      {selectedTrace.estimatedPromptTokens}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Trace steps</p>
                    {selectedTrace.steps.length === 0 ? (
                      <p className="text-[11px] text-ink-800">No tools used.</p>
                    ) : (
                      <ul className="space-y-1">
                        {selectedTrace.steps.map((step, index) => (
                          <li
                            key={`${selectedTrace.id}-${step.toolName}-${index}`}
                            className="rounded border border-paper-100 bg-white p-2"
                          >
                            <p className="text-[11px] font-medium">
                              {index + 1}. {step.toolName}
                              {step.isError ? " (error)" : ""}
                            </p>
                            <pre className="mt-1 overflow-auto whitespace-pre-wrap text-[11px]">
                              args: {JSON.stringify(step.input, null, 2)}
                            </pre>
                            <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[11px]">
                              {step.output}
                            </pre>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-paper-100 p-3">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`}>
            {message.role === "tool" ? (
              <ToolCallMessage message={message} />
            ) : (
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === "user" ? "ml-auto bg-accent-600 text-white" : "bg-paper-50"}`}
              >
                {message.role === "assistant" ? (
                  <AssistantMessage content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">
                    {message.content}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {chatLoading ? (
          <p className="text-sm text-ink-800">Assistant is responding...</p>
        ) : null}
        {messages.length === 0 ? (
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
