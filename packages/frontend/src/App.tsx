import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { listSkills, readSkill } from "./api/skills";
import Shell from "./components/layout/Shell";
import LoginPanel from "./features/auth/LoginPanel";
import ChatPane from "./features/chat/ChatPane";
import { MODEL_OPTIONS } from "./features/chat/model-options";
import { useChatSession } from "./features/chat/useChatSession";
import WorkspaceSidebar from "./features/workspace/WorkspaceSidebar";
import { collectFiles, findNodeByPath } from "./features/workspace/path-utils";
import { useAuthStore } from "./stores/authStore";
import { useSessionStore } from "./stores/sessionStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import type { Provider, SkillManifestItem } from "./types";

const WorkspaceEditor = lazy(
  () => import("./components/workspace/WorkspaceEditor"),
);

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
  const resetWorkspace = useWorkspaceStore((state) => state.reset);
  const undoWorkspaceReset = useWorkspaceStore((state) => state.undoReset);
  const canUndoWorkspaceReset = useWorkspaceStore(
    (state) => state.canUndoReset,
  );
  const toggleFolder = useWorkspaceStore((state) => state.toggleFolder);
  const openWorkspaceFile = useWorkspaceStore((state) => state.openFile);
  const setWorkspaceFileContent = useWorkspaceStore(
    (state) => state.setOpenFileContent,
  );
  const saveWorkspaceFile = useWorkspaceStore((state) => state.saveOpenFile);
  const createWorkspaceFile = useWorkspaceStore((state) => state.createFile);
  const removeWorkspaceFile = useWorkspaceStore((state) => state.deleteFile);
  const removeWorkspacePath = useWorkspaceStore((state) => state.deletePath);
  const renameWorkspacePath = useWorkspaceStore((state) => state.renamePath);
  const closeWorkspaceFile = useWorkspaceStore((state) => state.closeFile);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<
    "sessions" | "workspace" | "skills"
  >("sessions");
  const [selectedClassRef, setSelectedClassRef] = useState("");
  const [skills, setSkills] = useState<SkillManifestItem[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(
    null,
  );
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [skillLoading, setSkillLoading] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<
    string | null
  >(null);

  const {
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
  } = useChatSession({
    currentSession,
    provider,
    model,
    selectedClassRef,
    createNewSession,
    upsertCurrentSession,
    refreshSessions,
  });

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
    if (!teacher) {
      return;
    }

    void (async () => {
      try {
        const response = await listSkills();
        setSkills(response.skills);
        setSkillsError(null);
      } catch (error) {
        setSkills([]);
        setSkillsError(
          error instanceof Error ? error.message : "Failed to load skills",
        );
      }
    })();
  }, [teacher]);

  useEffect(() => {
    if (traceHistory.length === 0) {
      setSelectedTraceId(null);
      return;
    }

    if (!selectedTraceId) {
      setSelectedTraceId(traceHistory[0].id);
    }
  }, [traceHistory, selectedTraceId]);

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
            <div className="mb-2 grid grid-cols-3 gap-1">
              <button
                className={`rounded-lg border px-2 py-1 text-xs ${sidebarTab === "sessions" ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
                type="button"
                onClick={() => setSidebarTab("sessions")}
              >
                Sessions
              </button>
              <button
                className={`rounded-lg border px-2 py-1 text-xs ${sidebarTab === "workspace" ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
                type="button"
                onClick={() => setSidebarTab("workspace")}
              >
                Workspace
              </button>
              <button
                className={`rounded-lg border px-2 py-1 text-xs ${sidebarTab === "skills" ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
                type="button"
                onClick={() => setSidebarTab("skills")}
              >
                Skills
              </button>
            </div>
          </section>

          {sidebarTab === "workspace" ? (
            <WorkspaceSidebar
              workspaceTree={workspaceTree}
              workspaceFilesCount={workspaceFiles.length}
              expandedFolders={expandedFolders}
              activeFilePath={workspaceFilePath}
              selectedWorkspacePath={selectedWorkspacePath}
              selectedWorkspaceNode={selectedWorkspaceNode}
              workspaceError={workspaceError}
              onSelectWorkspacePath={setSelectedWorkspacePath}
              onToggleFolder={toggleFolder}
              onOpenWorkspaceFile={openWorkspaceFile}
              onResetWorkspace={resetWorkspace}
              onUndoWorkspaceReset={undoWorkspaceReset}
              canUndoWorkspaceReset={canUndoWorkspaceReset}
              onRenameWorkspacePath={renameWorkspacePath}
              onCreateWorkspaceFile={createWorkspaceFile}
              onDeleteWorkspacePath={removeWorkspacePath}
            />
          ) : null}

          {sidebarTab === "sessions" ? (
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
                      {session.messages[0]?.content.slice(0, 48) ||
                        "New session"}
                    </button>
                    <div className="mt-2 flex items-center justify-between text-xs text-ink-800">
                      <span>
                        {new Date(session.updatedAt).toLocaleString()}
                      </span>
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
          ) : null}

          {sidebarTab === "skills" ? (
            <section>
              <h2 className="mb-2 font-display text-lg">Skills</h2>
              <div className="space-y-2">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className={`rounded-lg border p-2 ${activeSkills.includes(skill.name) ? "border-accent-600 bg-paper-50" : "border-paper-100"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-left text-sm font-medium underline decoration-dotted underline-offset-2"
                        type="button"
                        onClick={() => {
                          void (async () => {
                            setSkillLoading(true);
                            setSelectedSkillName(skill.name);
                            try {
                              const loaded = await readSkill(skill.name);
                              setSelectedSkillContent(loaded.content);
                              setSkillsError(null);
                            } catch (error) {
                              setSelectedSkillContent("");
                              setSkillsError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to load skill file",
                              );
                            } finally {
                              setSkillLoading(false);
                            }
                          })();
                        }}
                      >
                        {skill.name}
                      </button>
                      {activeSkills.includes(skill.name) ? (
                        <span className="text-xs text-accent-600">Active</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-800">
                      {skill.description}
                    </p>
                  </div>
                ))}
                {skills.length === 0 && !skillsError ? (
                  <p className="text-sm text-ink-800">No skills available.</p>
                ) : null}
                {skillsError ? (
                  <p className="text-sm text-red-700">{skillsError}</p>
                ) : null}
                {selectedSkillName ? (
                  <div className="rounded-lg border border-paper-100 bg-white p-2">
                    <p className="text-xs font-medium">
                      {skillLoading
                        ? `Loading ${selectedSkillName}...`
                        : `${selectedSkillName} (full file)`}
                    </p>
                    {!skillLoading ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                        {selectedSkillContent}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
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
          traceHistory={traceHistory}
          traceExpanded={traceExpanded}
          setTraceExpanded={setTraceExpanded}
          selectedTraceId={selectedTraceId}
          setSelectedTraceId={setSelectedTraceId}
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
