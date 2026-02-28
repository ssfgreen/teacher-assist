import {
  type FormEvent,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
} from "react";

import { sendChatStream } from "./api/chat";
import Shell from "./components/layout/Shell";
import { useAuthStore } from "./stores/authStore";
import { useSessionStore } from "./stores/sessionStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import type { ChatMessage, Provider, WorkspaceNode } from "./types";

const WorkspaceEditor = lazy(
  () => import("./components/workspace/WorkspaceEditor"),
);
const ReactMarkdown = lazy(() => import("react-markdown"));

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

function collectFiles(nodes: WorkspaceNode[]): string[] {
  const files: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      files.push(node.path);
      continue;
    }
    files.push(...collectFiles(node.children ?? []));
  }
  return files;
}

function findNodeByPath(
  nodes: WorkspaceNode[],
  path: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.type === "directory") {
      const found = findNodeByPath(node.children ?? [], path);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function parentDirectory(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

function joinPath(base: string, suffix: string): string {
  if (!base) {
    return suffix;
  }
  return `${base}/${suffix}`;
}

function resolveRenameTargetPath(
  selectedNode: WorkspaceNode,
  userInput: string,
): string {
  const normalizedInput = userInput
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalizedInput) {
    return selectedNode.path;
  }

  if (normalizedInput.includes("/")) {
    return normalizedInput;
  }

  const parent = parentDirectory(selectedNode.path);
  return joinPath(parent, normalizedInput);
}

function displayContextPath(path: string): string {
  if (path === "soul.md") {
    return "assistant identity";
  }

  if (path.startsWith("classes/") && path.endsWith("/CLASS.md")) {
    const classRef = path.replace("classes/", "").replace("/CLASS.md", "");
    return `${classRef} class profile`;
  }

  if (path.startsWith("curriculum/")) {
    return `${path.replace("curriculum/", "").replace(".md", "")} curriculum`;
  }

  if (path === "pedagogy.md") {
    return "pedagogy preferences";
  }

  if (path === "teacher.md") {
    return "teacher profile";
  }

  return path;
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

  const workspaceTree = useWorkspaceStore((state) => state.tree);
  const classRefs = useWorkspaceStore((state) => state.classRefs);
  const workspaceFilePath = useWorkspaceStore((state) => state.openFilePath);
  const workspaceFileContent = useWorkspaceStore(
    (state) => state.openFileContent,
  );
  const workspaceDirty = useWorkspaceStore((state) => state.dirty);
  const workspaceLoading = useWorkspaceStore((state) => state.loading);
  const workspaceSaving = useWorkspaceStore((state) => state.saving);
  const workspaceError = useWorkspaceStore((state) => state.error);
  const expandedFolders = useWorkspaceStore((state) => state.expandedFolders);
  const initialiseWorkspace = useWorkspaceStore((state) => state.initialise);
  const seedWorkspace = useWorkspaceStore((state) => state.seed);
  const toggleFolder = useWorkspaceStore((state) => state.toggleFolder);
  const openWorkspaceFile = useWorkspaceStore((state) => state.openFile);
  const setWorkspaceFileContent = useWorkspaceStore(
    (state) => state.setOpenFileContent,
  );
  const saveWorkspaceFile = useWorkspaceStore((state) => state.saveOpenFile);
  const createWorkspaceFile = useWorkspaceStore((state) => state.createFile);
  const removeWorkspaceFile = useWorkspaceStore((state) => state.deleteFile);
  const renameWorkspacePath = useWorkspaceStore((state) => state.renamePath);
  const closeWorkspaceFile = useWorkspaceStore((state) => state.closeFile);

  const [messageInput, setMessageInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedClassRef, setSelectedClassRef] = useState("");
  const [contextExpanded, setContextExpanded] = useState(false);
  const [lastContextPaths, setLastContextPaths] = useState<string[]>([]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<
    string | null
  >(null);

  useEffect(() => {
    void initialiseAuth();
  }, [initialiseAuth]);

  useEffect(() => {
    if (!teacher) {
      return;
    }
    void Promise.all([initialiseSessions(), initialiseWorkspace()]);
  }, [teacher, initialiseSessions, initialiseWorkspace]);

  useEffect(() => {
    if (!workspaceDirty || !workspaceFilePath) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWorkspaceFile();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [workspaceDirty, workspaceFilePath, saveWorkspaceFile]);

  const messages = useMemo(
    () => currentSession?.messages ?? [],
    [currentSession?.messages],
  );

  const workspaceFiles = useMemo(
    () => collectFiles(workspaceTree),
    [workspaceTree],
  );
  const selectedWorkspaceNode = useMemo(() => {
    if (!selectedWorkspacePath) {
      return null;
    }
    return findNodeByPath(workspaceTree, selectedWorkspacePath);
  }, [workspaceTree, selectedWorkspacePath]);

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

  const openSessionInChat = async (sessionId: string) => {
    closeWorkspaceFile();
    await selectSession(sessionId);
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
        <div className="space-y-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg">Workspace</h2>
              <div className="flex gap-1">
                <button
                  className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
                  type="button"
                  onClick={() => void seedWorkspace()}
                >
                  Seed
                </button>
                <button
                  className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    if (!selectedWorkspaceNode) {
                      return;
                    }

                    const suggestedName = selectedWorkspaceNode.path
                      .split("/")
                      .filter(Boolean)
                      .at(-1);
                    const nextPath = window.prompt(
                      "Rename to (name or path)",
                      suggestedName ?? selectedWorkspaceNode.path,
                    );
                    if (!nextPath) {
                      return;
                    }

                    const resolvedPath = resolveRenameTargetPath(
                      selectedWorkspaceNode,
                      nextPath,
                    );
                    void renameWorkspacePath(
                      selectedWorkspaceNode.path,
                      resolvedPath,
                    );
                    setSelectedWorkspacePath(resolvedPath);
                  }}
                  disabled={!selectedWorkspaceNode}
                >
                  Rename
                </button>
                <button
                  className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    const folderName = window.prompt(
                      "Folder name (or relative path)",
                      "new-folder",
                    );
                    if (!folderName) {
                      return;
                    }

                    const normalizedFolder = folderName
                      .trim()
                      .replace(/^\/+/, "")
                      .replace(/\/+$/, "");
                    if (!normalizedFolder) {
                      return;
                    }

                    const baseDir =
                      selectedWorkspaceNode?.type === "directory"
                        ? selectedWorkspaceNode.path
                        : selectedWorkspaceNode
                          ? parentDirectory(selectedWorkspaceNode.path)
                          : "";
                    const folderPath = joinPath(baseDir, normalizedFolder);
                    void createWorkspaceFile(
                      `${folderPath}/README.md`,
                      "# Folder Notes\n\n",
                    );
                  }}
                >
                  New Folder
                </button>
                <button
                  className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    const fileName = window.prompt(
                      "File name (or relative path)",
                      "new-file.md",
                    );
                    if (!fileName) {
                      return;
                    }

                    const normalizedFile = fileName
                      .trim()
                      .replace(/^\/+/, "")
                      .replace(/\/+$/, "");
                    if (!normalizedFile) {
                      return;
                    }

                    const baseDir =
                      selectedWorkspaceNode?.type === "directory"
                        ? selectedWorkspaceNode.path
                        : selectedWorkspaceNode
                          ? parentDirectory(selectedWorkspaceNode.path)
                          : "";
                    const filePath = joinPath(baseDir, normalizedFile);
                    void createWorkspaceFile(filePath, "# New file\n");
                  }}
                >
                  New File
                </button>
              </div>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-paper-100 p-2">
              {workspaceTree.map((node) => (
                <WorkspaceTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  activePath={workspaceFilePath}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  selectedPath={selectedWorkspacePath}
                  onSelectPath={setSelectedWorkspacePath}
                  onOpenFile={openWorkspaceFile}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-800">
              {workspaceFiles.length} files
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
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
                  className={`rounded-lg border p-2 ${!workspaceFilePath && currentSession?.id === session.id ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
                >
                  <button
                    className="w-full text-left text-sm"
                    type="button"
                    onClick={() => void openSessionInChat(session.id)}
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
          </section>

          {workspaceError ? (
            <p className="text-xs text-red-700">{workspaceError}</p>
          ) : null}
        </div>
      }
    >
      {workspaceFilePath ? (
        <div className="h-[70vh]">
          <section className="flex h-full min-h-0 flex-col rounded-lg border border-paper-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="truncate text-sm">Editing {workspaceFilePath}</p>
              <div className="flex items-center gap-1">
                <button
                  className="rounded border border-paper-100 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => closeWorkspaceFile()}
                >
                  Back to chat
                </button>
                <button
                  className="rounded border border-paper-100 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => void saveWorkspaceFile()}
                  disabled={workspaceSaving}
                >
                  {workspaceSaving
                    ? "Saving..."
                    : workspaceDirty
                      ? "Save"
                      : "Saved"}
                </button>
                <button
                  className="rounded border border-paper-100 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => {
                    if (workspaceFilePath === "soul.md") {
                      return;
                    }
                    if (window.confirm(`Delete ${workspaceFilePath}?`)) {
                      void removeWorkspaceFile(workspaceFilePath);
                    }
                  }}
                  disabled={workspaceFilePath === "soul.md"}
                >
                  Delete
                </button>
              </div>
            </div>
            <Suspense
              fallback={
                <p className="text-xs text-ink-800">Loading editor...</p>
              }
            >
              <WorkspaceEditor
                key={workspaceFilePath}
                value={workspaceFileContent}
                onChange={setWorkspaceFileContent}
                disabled={workspaceLoading}
              />
            </Suspense>
          </section>
        </div>
      ) : (
        <ChatPane
          classRefs={classRefs}
          selectedClassRef={selectedClassRef}
          setSelectedClassRef={setSelectedClassRef}
          lastContextPaths={lastContextPaths}
          contextExpanded={contextExpanded}
          setContextExpanded={setContextExpanded}
          messages={messages}
          chatLoading={chatLoading}
          chatError={chatError}
          sessionError={sessionError}
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          sessionLoading={sessionLoading}
          sendMessage={sendMessage}
        />
      )}
    </Shell>
  );
}

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

function ChatPane({
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

interface WorkspaceTreeItemProps {
  node: WorkspaceNode;
  depth: number;
  activePath: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  onOpenFile: (path: string) => Promise<void>;
}

function WorkspaceTreeItem({
  node,
  depth,
  activePath,
  expandedFolders,
  onToggleFolder,
  selectedPath,
  onSelectPath,
  onOpenFile,
}: WorkspaceTreeItemProps) {
  const indent = { paddingLeft: `${depth * 12}px` };

  if (node.type === "directory") {
    const expanded = expandedFolders[node.path] ?? true;
    return (
      <div>
        <button
          className={`w-full rounded px-1 py-0.5 text-left text-xs font-medium ${selectedPath === node.path ? "bg-paper-50" : ""}`}
          style={indent}
          type="button"
          onClick={() => {
            onSelectPath(node.path);
            onToggleFolder(node.path);
          }}
        >
          {expanded ? "▾" : "▸"} {node.name}
        </button>
        {expanded
          ? (node.children ?? []).map((child) => (
              <WorkspaceTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                onOpenFile={onOpenFile}
              />
            ))
          : null}
      </div>
    );
  }

  const label = node.path === "soul.md" ? `✦ ${node.name}` : node.name;

  return (
    <button
      className={`w-full rounded px-1 py-0.5 text-left text-xs ${activePath === node.path || selectedPath === node.path ? "bg-paper-50" : ""}`}
      style={indent}
      type="button"
      onClick={() => {
        onSelectPath(node.path);
        void onOpenFile(node.path);
      }}
    >
      {label}
    </button>
  );
}
