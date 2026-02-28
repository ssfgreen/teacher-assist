import { Suspense, lazy } from "react";

import type { ChatMessage } from "../../types";
import { displayContextPath } from "../workspace/path-utils";

const ReactMarkdown = lazy(() => import("react-markdown"));

interface ChatPaneProps {
  classRefs: string[];
  selectedClassRef: string;
  setSelectedClassRef: (value: string) => void;
  lastContextPaths: string[];
  contextExpanded: boolean;
  setContextExpanded: (
    value: boolean | ((current: boolean) => boolean),
  ) => void;
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
  messages,
  chatLoading,
  chatError,
  sessionError,
  messageInput,
  setMessageInput,
  sessionLoading,
  sendMessage,
}: ChatPaneProps) {
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

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-paper-100 p-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === "user" ? "ml-auto bg-accent-600 text-white" : "bg-paper-50"}`}
          >
            {message.role === "assistant" ? (
              <div className="prose prose-sm max-w-none">
                <Suspense
                  fallback={
                    <p className="whitespace-pre-wrap text-sm">
                      {message.content}
                    </p>
                  }
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </Suspense>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
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
