import { type FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { sendChat } from "./api/chat";
import Shell from "./components/layout/Shell";
import { useAuthStore } from "./stores/authStore";
import { useSessionStore } from "./stores/sessionStore";
import type { ChatMessage, Provider } from "./types";

const MODEL_OPTIONS: Record<Provider, string[]> = {
  anthropic: ["mock-anthropic", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: [
    "mock-openai",
    "gpt-5.2-2025-12-11",
    "gpt-5-mini-2025-08-07",
    "gpt-5-nano-2025-08-07",
  ],
};

function LoginPanel() {
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("teacher@example.com");
  const [password, setPassword] = useState("password123");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password);
    } catch {
      // Error is already stored in auth state.
    }
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-paper-100 bg-white p-6 shadow-sm">
      <h1 className="font-display text-3xl">Teacher Assist</h1>
      <p className="mt-2 text-sm text-ink-800">Sign in to continue.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-paper-100 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-paper-100 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          className="w-full rounded-lg bg-accent-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const teacher = useAuthStore((state) => state.teacher);
  const authLoading = useAuthStore((state) => state.loading);
  const initialiseAuth = useAuthStore((state) => state.initialise);
  const logout = useAuthStore((state) => state.logout);

  const sessions = useSessionStore((state) => state.sessions);
  const currentSession = useSessionStore((state) => state.currentSession);
  const provider = useSessionStore((state) => state.provider);
  const model = useSessionStore((state) => state.model);
  const sessionLoading = useSessionStore((state) => state.loading);
  const sessionError = useSessionStore((state) => state.error);
  const initialiseSessions = useSessionStore((state) => state.initialise);
  const createNewSession = useSessionStore((state) => state.createNewSession);
  const selectSession = useSessionStore((state) => state.selectSession);
  const upsertCurrentSession = useSessionStore(
    (state) => state.upsertCurrentSession,
  );
  const refreshSessions = useSessionStore((state) => state.refreshSessions);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const setProvider = useSessionStore((state) => state.setProvider);
  const setModel = useSessionStore((state) => state.setModel);

  const [messageInput, setMessageInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    void initialiseAuth();
  }, [initialiseAuth]);

  useEffect(() => {
    if (!teacher) {
      return;
    }
    void initialiseSessions();
  }, [teacher, initialiseSessions]);

  const messages = useMemo(
    () => currentSession?.messages ?? [],
    [currentSession?.messages],
  );

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

      const response = await sendChat({
        sessionId: activeSession.id,
        provider,
        model,
        messages: nextMessages,
      });

      const updatedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: response.response.content,
        },
      ];

      const updatedSession = {
        ...activeSession,
        provider,
        model,
        updatedAt: new Date().toISOString(),
        messages: updatedMessages,
      };

      upsertCurrentSession(updatedSession);
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

  if (!teacher) {
    if (authLoading) {
      return <div className="p-8 text-center text-sm">Loading...</div>;
    }
    return <LoginPanel />;
  }

  return (
    <Shell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((current) => !current)}
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl">Teacher Assist</h1>
            <p className="text-sm text-ink-800">{teacher.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-paper-100 px-2 py-1 text-sm"
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value as Provider;
                const fallbackModel = MODEL_OPTIONS[nextProvider][0];
                setProvider(nextProvider);
                setModel(fallbackModel);
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <select
              className="rounded-lg border border-paper-100 px-2 py-1 text-sm"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {MODEL_OPTIONS[provider].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg border border-paper-100 px-3 py-1 text-sm"
              type="button"
              onClick={() => void logout()}
            >
              Logout
            </button>
          </div>
        </div>
      }
      sidebar={
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">Sessions</h2>
            <button
              className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
              type="button"
              onClick={() => void createNewSession()}
            >
              New
            </button>
          </div>
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`rounded-lg border p-2 ${currentSession?.id === session.id ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
              >
                <button
                  className="w-full text-left text-sm"
                  type="button"
                  onClick={() => void selectSession(session.id)}
                >
                  {session.messages[0]?.content.slice(0, 48) || "New session"}
                </button>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-800">
                  <span>{new Date(session.updatedAt).toLocaleString()}</span>
                  <button
                    className="rounded border border-paper-100 px-2 py-0.5"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this session? This cannot be undone.",
                        )
                      ) {
                        void deleteSession(session.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {sessions.length === 0 ? (
              <p className="text-sm text-ink-800">No sessions yet.</p>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="flex h-[70vh] flex-col">
        <div className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-paper-100 p-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === "user" ? "ml-auto bg-accent-600 text-white" : "bg-paper-50"}`}
            >
              {message.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
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
            <p className="text-sm text-ink-800">
              Start a conversation to begin.
            </p>
          ) : null}
        </div>

        {(chatError || sessionError) && (
          <p className="mb-2 text-sm text-red-700">
            {chatError ?? sessionError}
          </p>
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
    </Shell>
  );
}
