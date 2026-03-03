import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  MessageSquarePlus,
  PanelRightClose,
  Sparkles,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { listCommands } from "./api/commands";
import { readMemoryFile as readMemoryFileApi } from "./api/memory";
import { listSkills, readSkill } from "./api/skills";
import { readWorkspaceFile as readWorkspaceFileApi } from "./api/workspace";
import Shell from "./components/layout/Shell";
import MarkdownRenderer from "./components/markdown/MarkdownRenderer";
import LoginPanel from "./features/auth/LoginPanel";
import ChatPane from "./features/chat/ChatPane";
import InteractiveCard from "./features/chat/InteractiveCard";
import { MODEL_OPTIONS } from "./features/chat/model-options";
import { useChatSession } from "./features/chat/useChatSession";
import MemoryCaptureCard from "./features/memory/MemoryCaptureCard";
import MemoryTree from "./features/memory/MemoryTree";
import TraceViewer from "./features/traces/TraceViewer";
import WorkspaceSidebar from "./features/workspace/WorkspaceSidebar";
import { collectFiles, findNodeByPath } from "./features/workspace/path-utils";
import { useAuthStore } from "./stores/authStore";
import { useMemoryStore } from "./stores/memoryStore";
import { useSessionStore } from "./stores/sessionStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import type {
  ChatMessage,
  CommandSummary,
  SessionRecord,
  SkillManifestItem,
  WorkspaceNode,
} from "./types";

const WorkspaceEditor = lazy(
  () => import("./components/workspace/WorkspaceEditor"),
);

type SidebarSection = "workspace" | "sessions" | "skills" | "memory";
type InspectorSource =
  | "skill"
  | "workspace"
  | "memory"
  | "prompt"
  | "response"
  | "tool";
type InspectorRenderMode = "markdown" | "pre";

interface InspectorState {
  source: InspectorSource;
  title: string;
  content: string;
  loading: boolean;
  error: string | null;
  renderMode: InspectorRenderMode;
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const deltaMs = Math.max(0, now - then);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return "just now";
  }
  if (deltaMs < hour) {
    const minutes = Math.floor(deltaMs / minute);
    return `${minutes}m ago`;
  }
  if (deltaMs < day) {
    const hours = Math.floor(deltaMs / hour);
    return `${hours}h ago`;
  }

  const days = Math.floor(deltaMs / day);
  return `${days}d ago`;
}

function sessionTitle(
  session: SessionRecord,
  manualTitles: Record<string, string>,
): string {
  if (manualTitles[session.id]) {
    return manualTitles[session.id];
  }

  const firstUserMessage = session.messages.find(
    (message) => message.role === "user",
  );
  if (!firstUserMessage?.content) {
    return "New session";
  }

  return firstUserMessage.content.slice(0, 56);
}

function collectFolderPaths(tree: WorkspaceNode[]): string[] {
  const result: string[] = [];
  const walk = (nodes: WorkspaceNode[]) => {
    for (const node of nodes) {
      if (node.type === "directory") {
        result.push(node.path);
        walk(node.children ?? []);
      }
    }
  };
  walk(tree);
  return result;
}

function virtualWorkspaceContextContent(params: {
  path: string;
  selectedClassRef: string;
  classRefs: string[];
  workspaceTree: WorkspaceNode[];
}): string | null {
  const { path, selectedClassRef, classRefs, workspaceTree } = params;
  if (path === "classes/index.md") {
    const classRef = selectedClassRef.trim().toUpperCase();
    if (!classRef) {
      return "Selected class reference: none\nClass profile path: classes/{CLASS}/CLASS.md\nUse read_file to load this profile only if needed.";
    }
    return `Selected class reference: ${classRef}\nClass profile path: classes/${classRef}/CLASS.md\nUse read_file to load this profile only if needed.`;
  }

  if (path === "classes/catalog.md") {
    const available = [...classRefs]
      .map((value) => value.toUpperCase())
      .sort((a, b) => a.localeCompare(b));
    return available.length > 0
      ? `Available class references: ${available.join(", ")}`
      : "Available class references: none";
  }

  if (path === "curriculum/catalog.md") {
    const curriculumFiles = collectFiles(workspaceTree)
      .filter((filePath) => filePath.startsWith("curriculum/"))
      .filter((filePath) => filePath.toLowerCase().endsWith(".md"))
      .filter((filePath) => filePath.toLowerCase() !== "curriculum/readme.md");

    return curriculumFiles.length > 0
      ? [
          "Available curriculum files:",
          ...curriculumFiles.map((filePath) => `- ${filePath}`),
          "Use read_file to load only relevant curriculum files.",
        ].join("\n")
      : "Available curriculum files: none";
  }

  return null;
}

function SectionHeader({
  title,
  expanded,
  onToggle,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-700"
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={title}
    >
      <span>{title}</span>
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </button>
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
  const [sidebarSections, setSidebarSections] = useState<
    Record<SidebarSection, boolean>
  >({
    workspace: false,
    sessions: true,
    skills: false,
    memory: false,
  });
  const [selectedClassRef, setSelectedClassRef] = useState("");
  const [selectedCommandId, setSelectedCommandId] = useState("");
  const [commands, setCommands] = useState<CommandSummary[]>([]);
  const [commandsError, setCommandsError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillManifestItem[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(
    null,
  );
  const [selectedSkillDocPathByName, setSelectedSkillDocPathByName] = useState<
    Record<string, string>
  >({});
  const [skillLoadingTarget, setSkillLoadingTarget] = useState<string | null>(
    null,
  );
  const [skillContentByName, setSkillContentByName] = useState<
    Record<string, string>
  >({});
  const [skillContentByTarget, setSkillContentByTarget] = useState<
    Record<string, string>
  >({});
  const [skillErrorByName, setSkillErrorByName] = useState<
    Record<string, string>
  >({});
  const [focusComposerToken, setFocusComposerToken] = useState(0);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<
    string | null
  >(null);
  const [selectedMemoryPath, setSelectedMemoryPath] = useState<string | null>(
    null,
  );
  const [selectedTraceSessionId, setSelectedTraceSessionId] = useState<
    string | null
  >(null);
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState<string | null>(
    null,
  );
  const [sessionTitlesById, setSessionTitlesById] = useState<
    Record<string, string>
  >({});
  const [inspector, setInspector] = useState<InspectorState | null>(null);

  const memoryTree = useMemoryStore((state) => state.tree);
  const memoryFilePath = useMemoryStore((state) => state.openFilePath);
  const memoryFileContent = useMemoryStore((state) => state.openFileContent);
  const memoryDirty = useMemoryStore((state) => state.dirty);
  const memoryLoading = useMemoryStore((state) => state.loading);
  const memorySaving = useMemoryStore((state) => state.saving);
  const memoryError = useMemoryStore((state) => state.error);
  const initialiseMemory = useMemoryStore((state) => state.initialise);
  const openMemoryFile = useMemoryStore((state) => state.openFile);
  const closeMemoryFile = useMemoryStore((state) => state.closeFile);
  const setMemoryFileContent = useMemoryStore(
    (state) => state.setOpenFileContent,
  );
  const saveMemoryFile = useMemoryStore((state) => state.saveOpenFile);
  const removeMemoryFile = useMemoryStore((state) => state.deleteFile);

  const {
    messageInput,
    setMessageInput,
    chatLoading,
    chatError,
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
  } = useChatSession({
    currentSession,
    provider,
    model,
    selectedCommandId,
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
    void Promise.all([
      initialiseSessions(),
      initialiseWorkspace(),
      initialiseMemory(),
    ]);
  }, [teacher, initialiseSessions, initialiseWorkspace, initialiseMemory]);

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
    if (!teacher) {
      return;
    }

    void (async () => {
      try {
        const response = await listCommands();
        setCommands(response.commands);
        setCommandsError(null);
      } catch (error) {
        setCommands([]);
        setCommandsError(
          error instanceof Error ? error.message : "Failed to load commands",
        );
      }
    })();
  }, [teacher]);

  useEffect(() => {
    if (!workspaceDirty || !workspaceFilePath) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWorkspaceFile();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [workspaceDirty, workspaceFilePath, saveWorkspaceFile]);

  useEffect(() => {
    if (!memoryDirty || !memoryFilePath) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveMemoryFile();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [memoryDirty, memoryFilePath, saveMemoryFile]);

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
  const workspaceFolderPaths = useMemo(
    () => collectFolderPaths(workspaceTree),
    [workspaceTree],
  );

  const openSessionInChat = async (sessionId: string) => {
    closeWorkspaceFile();
    closeMemoryFile();
    setSelectedSkillName(null);
    setSelectedTraceSessionId(null);
    setInspector(null);
    await selectSession(sessionId);
  };

  const expandAllWorkspaceFolders = () => {
    for (const path of workspaceFolderPaths) {
      if (!(expandedFolders[path] ?? true)) {
        toggleFolder(path);
      }
    }
  };

  const collapseAllWorkspaceFolders = () => {
    for (const path of workspaceFolderPaths) {
      if (expandedFolders[path] ?? true) {
        toggleFolder(path);
      }
    }
  };

  const toggleSidebarSection = (section: SidebarSection) => {
    setSidebarSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const loadSkillContent = async (target: string) => {
    if (skillContentByTarget[target]) {
      return;
    }

    setSkillLoadingTarget(target);
    try {
      const loaded = await readSkill(target);
      setSkillContentByTarget((current) => ({
        ...current,
        [target]: loaded.content,
      }));
      if (loaded.tier === 2) {
        setSkillContentByName((current) => ({
          ...current,
          [target]: loaded.content,
        }));
      }
      setSkillErrorByName((current) => {
        const next = { ...current };
        delete next[target];
        return next;
      });
    } catch (error) {
      setSkillErrorByName((current) => ({
        ...current,
        [target]:
          error instanceof Error ? error.message : "Failed to load skill file",
      }));
    } finally {
      setSkillLoadingTarget(null);
    }
  };

  const openSkill = (skillName: string) => {
    closeWorkspaceFile();
    closeMemoryFile();
    setSelectedSkillName(skillName);
    setSelectedSkillDocPathByName((current) => ({
      ...current,
      [skillName]: "SKILL.md",
    }));
    void loadSkillContent(skillName);
  };

  const inspectSkill = async (skillName: string) => {
    if (!skillName) {
      return;
    }
    const target =
      skillName.includes("/") || skillName.endsWith(".md")
        ? skillName
        : `${skillName}`;

    setInspector({
      source: "skill",
      title: target,
      content: skillContentByTarget[target] ?? "",
      loading: !skillContentByTarget[target],
      error: null,
      renderMode: "markdown",
    });

    if (skillContentByTarget[target]) {
      return;
    }

    try {
      const loaded = await readSkill(target);
      setSkillContentByTarget((current) => ({
        ...current,
        [target]: loaded.content,
      }));
      if (loaded.tier === 2) {
        setSkillContentByName((current) => ({
          ...current,
          [target]: loaded.content,
        }));
      }
      setInspector((current) =>
        current && current.source === "skill" && current.title === target
          ? {
              ...current,
              content: loaded.content,
              loading: false,
              error: null,
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load skill file";
      setInspector((current) =>
        current && current.source === "skill" && current.title === target
          ? { ...current, loading: false, error: message }
          : current,
      );
    }
  };

  const inspectSkillDocument = async (skillName: string, href: string) => {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const withoutQuery = trimmed.split("#")[0]?.split("?")[0] ?? "";
    const sanitized = withoutQuery.replace(/^\.?\//, "").replace(/^\/+/, "");
    if (!sanitized || sanitized.includes("..")) {
      return;
    }

    const target = sanitized.includes("/")
      ? sanitized
      : `${skillName}/${sanitized}`;
    const title = `skill doc: ${target}`;

    setInspector({
      source: "skill",
      title,
      content: "",
      loading: true,
      error: null,
      renderMode: "markdown",
    });

    try {
      const loaded = await readSkill(target);
      setInspector((current) =>
        current && current.source === "skill" && current.title === title
          ? {
              ...current,
              content: loaded.content,
              loading: false,
              error: null,
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load linked skill document";
      setInspector((current) =>
        current && current.source === "skill" && current.title === title
          ? { ...current, loading: false, error: message }
          : current,
      );
    }
  };

  const currentSkillManifest = useMemo(
    () => skills.find((skill) => skill.name === selectedSkillName) ?? null,
    [skills, selectedSkillName],
  );
  const currentSkillDocPath = selectedSkillName
    ? (selectedSkillDocPathByName[selectedSkillName] ?? "SKILL.md")
    : "SKILL.md";
  const currentSkillTarget = selectedSkillName
    ? currentSkillDocPath === "SKILL.md"
      ? selectedSkillName
      : `${selectedSkillName}/${currentSkillDocPath}`
    : "";
  const currentSkillContent = currentSkillTarget
    ? (skillContentByTarget[currentSkillTarget] ??
      (currentSkillDocPath === "SKILL.md" && selectedSkillName
        ? skillContentByName[selectedSkillName]
        : undefined))
    : undefined;

  const inspectWorkspacePath = async (path: string) => {
    const virtualContent = virtualWorkspaceContextContent({
      path,
      selectedClassRef,
      classRefs,
      workspaceTree,
    });
    if (virtualContent !== null) {
      setInspector({
        source: "workspace",
        title: path,
        content: virtualContent,
        loading: false,
        error: null,
        renderMode: "markdown",
      });
      return;
    }

    setInspector({
      source: "workspace",
      title: path,
      content: "",
      loading: true,
      error: null,
      renderMode: "markdown",
    });
    try {
      const file = await readWorkspaceFileApi(path);
      setInspector((current) =>
        current && current.source === "workspace" && current.title === path
          ? {
              ...current,
              content: file.content,
              loading: false,
              error: null,
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to load workspace file: ${path}`;
      setInspector((current) =>
        current && current.source === "workspace" && current.title === path
          ? { ...current, loading: false, error: message }
          : current,
      );
    }
  };

  const inspectMemoryPath = async (path: string) => {
    setInspector({
      source: "memory",
      title: path,
      content: "",
      loading: true,
      error: null,
      renderMode: "markdown",
    });
    try {
      const file = await readMemoryFileApi(path);
      setInspector((current) =>
        current && current.source === "memory" && current.title === path
          ? {
              ...current,
              content: file.content,
              loading: false,
              error: null,
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to load memory file: ${path}`;
      setInspector((current) =>
        current && current.source === "memory" && current.title === path
          ? { ...current, loading: false, error: message }
          : current,
      );
    }
  };

  const inspectReadFileTool = async (message: ChatMessage) => {
    const path =
      typeof message.toolInput?.path === "string" ? message.toolInput.path : "";
    const title = path ? `read_file: ${path}` : "read_file";

    setInspector({
      source: "tool",
      title,
      content: "",
      loading: true,
      error: null,
      renderMode: "markdown",
    });

    const fallbackContent = message.content || "(empty)";

    try {
      let fileContent = fallbackContent;

      if (path) {
        const virtualContent = virtualWorkspaceContextContent({
          path,
          selectedClassRef,
          classRefs,
          workspaceTree,
        });
        if (virtualContent !== null) {
          fileContent = virtualContent;
        } else if (path === "MEMORY.md" || path.endsWith("/MEMORY.md")) {
          fileContent = (await readMemoryFileApi(path)).content;
        } else {
          fileContent = (await readWorkspaceFileApi(path)).content;
        }
      }

      setInspector((current) =>
        current && current.source === "tool" && current.title === title
          ? {
              ...current,
              content: fileContent,
              loading: false,
              error: null,
            }
          : current,
      );
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Failed to inspect read_file";
      setInspector((current) =>
        current && current.source === "tool" && current.title === title
          ? {
              ...current,
              content: `_Failed to load file from workspace (${messageText}); showing tool output instead._\n\n${fallbackContent}`,
              loading: false,
              error: null,
            }
          : current,
      );
    }
  };

  const inspectPrompt = (prompt: string, label: string) => {
    setInspector({
      source: "prompt",
      title: label,
      content: prompt,
      loading: false,
      error: null,
      renderMode: "pre",
    });
  };

  const inspectRawResponse = (content: string, label: string) => {
    setInspector({
      source: "response",
      title: label,
      content,
      loading: false,
      error: null,
      renderMode: "pre",
    });
  };

  const canViewTraces = teacher?.access?.traceViewer ?? false;

  const inspectorPanel = inspector ? (
    <aside
      data-testid="right-inspector"
      className="absolute inset-y-0 right-0 hidden w-[25rem] border-l border-paper-300 bg-surface-panel lg:block"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-paper-300 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink-700">
              {inspector.source}
            </p>
            <p className="truncate text-sm font-semibold">{inspector.title}</p>
          </div>
          <button
            className="rounded p-1 text-ink-700 transition hover:text-ink-900"
            type="button"
            aria-label="Close inspector"
            onClick={() => setInspector(null)}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {inspector.loading ? (
            <p className="text-xs text-ink-700">Loading…</p>
          ) : null}
          {inspector.error ? (
            <p className="text-xs text-danger-700">{inspector.error}</p>
          ) : null}
          {!inspector.loading && !inspector.error ? (
            inspector.renderMode === "pre" ? (
              <pre className="whitespace-pre-wrap text-xs leading-5">
                {inspector.content}
              </pre>
            ) : (
              <MarkdownRenderer content={inspector.content} />
            )
          ) : null}
        </div>
      </div>
    </aside>
  ) : null;

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
      sidebar={
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-3">
          <div className="mb-3">
            <h1 className="font-display text-xl">Teacher Assist</h1>
            <p className="text-sm text-ink-700">{teacher.name}</p>
          </div>

          <div className="space-y-2">
            <button
              className="w-full rounded-lg border border-paper-300 px-3 py-2 text-left text-sm font-medium transition hover:border-accent-500"
              type="button"
              onClick={() => {
                closeWorkspaceFile();
                closeMemoryFile();
                setSelectedSkillName(null);
                setSelectedTraceSessionId(null);
                setInspector(null);
                setFocusComposerToken((current) => current + 1);
                void createNewSession();
              }}
            >
              <span className="inline-flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4" />
                New Session
              </span>
            </button>
          </div>

          <section className="mt-4">
            <SectionHeader
              title="Workspace"
              expanded={sidebarSections.workspace}
              onToggle={() => toggleSidebarSection("workspace")}
            />
            {sidebarSections.workspace ? (
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
                onOpenWorkspaceFile={async (path) => {
                  setSelectedSkillName(null);
                  setInspector(null);
                  closeMemoryFile();
                  await openWorkspaceFile(path);
                }}
                onResetWorkspace={resetWorkspace}
                onUndoWorkspaceReset={undoWorkspaceReset}
                canUndoWorkspaceReset={canUndoWorkspaceReset}
                onRenameWorkspacePath={renameWorkspacePath}
                onCreateWorkspaceFile={createWorkspaceFile}
                onDeleteWorkspacePath={removeWorkspacePath}
                onExpandAllFolders={expandAllWorkspaceFolders}
                onCollapseAllFolders={collapseAllWorkspaceFolders}
              />
            ) : null}
          </section>

          <section className="mt-4">
            <SectionHeader
              title="Skills"
              expanded={sidebarSections.skills}
              onToggle={() => toggleSidebarSection("skills")}
            />
            {sidebarSections.skills ? (
              <div className="space-y-1">
                {skills.map((skill) => {
                  const isSelected = selectedSkillName === skill.name;
                  return (
                    <button
                      key={skill.name}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${isSelected ? "border-accent-500 bg-surface-selected" : "border-paper-300 hover:border-paper-400 hover:bg-surface-muted"}`}
                      type="button"
                      onClick={() => openSkill(skill.name)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold">
                          <Sparkles className="h-3.5 w-3.5" />
                          {skill.name}
                        </span>
                        {activeSkills.includes(skill.name) ? (
                          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] text-accent-700">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-700">
                        {skill.description}
                      </p>
                    </button>
                  );
                })}
                {skills.length === 0 && !skillsError ? (
                  <p className="text-sm text-ink-700">No skills available.</p>
                ) : null}
                {skillsError ? (
                  <p className="text-sm text-danger-700">{skillsError}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="mt-4">
            <SectionHeader
              title="Memory"
              expanded={sidebarSections.memory}
              onToggle={() => toggleSidebarSection("memory")}
            />
            {sidebarSections.memory ? (
              <>
                <MemoryTree
                  tree={memoryTree}
                  selectedPath={selectedMemoryPath}
                  onSelectFile={(path) => {
                    setSelectedMemoryPath(path);
                    setSelectedSkillName(null);
                    setInspector(null);
                    closeWorkspaceFile();
                    void openMemoryFile(path);
                  }}
                />
                {memoryError ? (
                  <p className="mt-2 text-sm text-danger-700">{memoryError}</p>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="mt-4">
            <SectionHeader
              title="Sessions"
              expanded={sidebarSections.sessions}
              onToggle={() => toggleSidebarSection("sessions")}
            />
            {sidebarSections.sessions ? (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isCurrent =
                    !workspaceFilePath &&
                    !memoryFilePath &&
                    !selectedSkillName &&
                    currentSession?.id === session.id;

                  return (
                    <div
                      key={session.id}
                      className={`group rounded-lg border px-2 py-1.5 transition ${isCurrent ? "border-accent-500 bg-surface-selected" : "border-paper-300 hover:border-paper-400 hover:bg-surface-muted"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          className="min-w-0 flex-1 text-left text-sm"
                          type="button"
                          onClick={() => void openSessionInChat(session.id)}
                        >
                          <span className="block truncate">
                            {sessionTitle(session, sessionTitlesById)}
                          </span>
                          <span className="text-xs text-ink-700">
                            {formatRelativeTime(session.updatedAt)}
                          </span>
                        </button>
                        {canViewTraces ? (
                          <button
                            className="rounded border border-paper-300 px-1.5 py-0.5 text-[11px] text-ink-700 hover:border-accent-500"
                            type="button"
                            onClick={() => {
                              closeWorkspaceFile();
                              closeMemoryFile();
                              setSelectedSkillName(null);
                              setInspector(null);
                              setSelectedTraceSessionId(session.id);
                            }}
                          >
                            Traces
                          </button>
                        ) : null}
                        <div className="relative">
                          <button
                            className="rounded-md px-1.5 py-0.5 text-xs text-ink-700 opacity-0 transition group-hover:opacity-100"
                            type="button"
                            aria-label={`Session actions for ${sessionTitle(session, sessionTitlesById)}`}
                            onClick={() => {
                              setSessionMenuOpenId((current) =>
                                current === session.id ? null : session.id,
                              );
                            }}
                          >
                            <Ellipsis className="h-4 w-4" />
                          </button>
                          {sessionMenuOpenId === session.id ? (
                            <div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-paper-300 bg-surface-panel p-1 text-xs shadow">
                              <button
                                className="block w-full rounded px-2 py-1 text-left hover:bg-paper-100"
                                type="button"
                                onClick={() => {
                                  const nextTitle = window.prompt(
                                    "Rename session",
                                    sessionTitle(session, sessionTitlesById),
                                  );
                                  if (nextTitle?.trim()) {
                                    setSessionTitlesById((current) => ({
                                      ...current,
                                      [session.id]: nextTitle.trim(),
                                    }));
                                  }
                                  setSessionMenuOpenId(null);
                                }}
                              >
                                Rename
                              </button>
                              <button
                                className="block w-full rounded px-2 py-1 text-left text-danger-700 hover:bg-danger-50"
                                type="button"
                                onClick={() => {
                                  void deleteSession(session.id);
                                  setSessionMenuOpenId(null);
                                }}
                              >
                                Archive
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sessions.length === 0 ? (
                  <p className="text-sm text-ink-700">No sessions yet.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="mt-auto pt-4">
            <button
              className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm hover:border-accent-500"
              type="button"
              onClick={() => void logout()}
            >
              Logout
            </button>
          </div>
        </div>
      }
    >
      {workspaceFilePath || memoryFilePath ? (
        <div className="h-full">
          <section className="flex h-full min-h-0 flex-col rounded-[20px] border border-paper-200 bg-surface-panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="truncate text-sm">
                Editing {workspaceFilePath ?? memoryFilePath}
              </p>
              <div className="flex items-center gap-1">
                <button
                  className="rounded-lg border border-paper-300 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => {
                    closeWorkspaceFile();
                    closeMemoryFile();
                  }}
                >
                  Back to chat
                </button>
                <button
                  className="rounded-lg border border-paper-300 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => {
                    if (workspaceFilePath) {
                      void saveWorkspaceFile();
                    } else if (memoryFilePath) {
                      void saveMemoryFile();
                    }
                  }}
                  disabled={workspaceSaving || memorySaving}
                >
                  {workspaceSaving || memorySaving
                    ? "Saving..."
                    : workspaceDirty || memoryDirty
                      ? "Save"
                      : "Saved"}
                </button>
                <button
                  className="rounded-lg border border-paper-300 px-2 py-0.5 text-xs"
                  type="button"
                  onClick={() => {
                    if (workspaceFilePath === "soul.md") {
                      return;
                    }
                    const target = workspaceFilePath ?? memoryFilePath;
                    if (!target) {
                      return;
                    }
                    if (window.confirm(`Delete ${target}?`)) {
                      if (workspaceFilePath) {
                        void removeWorkspaceFile(workspaceFilePath);
                      } else if (memoryFilePath) {
                        void removeMemoryFile(memoryFilePath);
                      }
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
                <p className="text-xs text-ink-700">Loading editor...</p>
              }
            >
              <WorkspaceEditor
                key={workspaceFilePath ?? memoryFilePath ?? "editor"}
                value={
                  workspaceFilePath ? workspaceFileContent : memoryFileContent
                }
                onChange={
                  workspaceFilePath
                    ? setWorkspaceFileContent
                    : setMemoryFileContent
                }
                disabled={workspaceLoading || memoryLoading}
              />
            </Suspense>
          </section>
        </div>
      ) : selectedSkillName ? (
        <div className="relative flex h-full min-h-0">
          <section
            className={`mx-auto flex h-full w-full max-w-4xl flex-col rounded-[20px] border border-paper-200 bg-surface-panel p-4 transition-[padding] duration-200 ease-out ${inspector ? "lg:pr-[26rem]" : ""}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl">{selectedSkillName}</h2>
              <button
                className="rounded-lg border border-paper-300 px-2 py-1 text-xs"
                type="button"
                onClick={() => setSelectedSkillName(null)}
              >
                Back to chat
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1 overflow-x-auto pb-1">
              <button
                className={`rounded-full border px-3 py-1 text-xs ${currentSkillDocPath === "SKILL.md" ? "border-accent-500 bg-accent-100 text-accent-700" : "border-paper-300 text-ink-700 hover:border-paper-400"}`}
                type="button"
                onClick={() => {
                  if (!selectedSkillName) {
                    return;
                  }
                  setSelectedSkillDocPathByName((current) => ({
                    ...current,
                    [selectedSkillName]: "SKILL.md",
                  }));
                  void loadSkillContent(selectedSkillName);
                }}
              >
                Overview
              </button>
              {(currentSkillManifest?.tier3Files ?? []).map((path) => (
                <button
                  key={path}
                  className={`rounded-full border px-3 py-1 text-xs ${currentSkillDocPath === path ? "border-accent-500 bg-accent-100 text-accent-700" : "border-paper-300 text-ink-700 hover:border-paper-400"}`}
                  type="button"
                  onClick={() => {
                    if (!selectedSkillName) {
                      return;
                    }
                    setSelectedSkillDocPathByName((current) => ({
                      ...current,
                      [selectedSkillName]: path,
                    }));
                    void loadSkillContent(`${selectedSkillName}/${path}`);
                  }}
                >
                  {path}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto pr-1">
              {skillLoadingTarget === currentSkillTarget ? (
                <p className="text-xs text-ink-700">Loading...</p>
              ) : null}
              {currentSkillTarget && skillErrorByName[currentSkillTarget] ? (
                <p className="text-xs text-danger-700">
                  {skillErrorByName[currentSkillTarget]}
                </p>
              ) : null}
              {currentSkillContent ? (
                <MarkdownRenderer
                  content={currentSkillContent}
                  onLinkClick={(href) => {
                    void inspectSkillDocument(selectedSkillName, href);
                  }}
                />
              ) : null}
            </div>
          </section>
          {inspectorPanel}
        </div>
      ) : selectedTraceSessionId ? (
        <TraceViewer
          sessionId={selectedTraceSessionId}
          onBack={() => setSelectedTraceSessionId(null)}
        />
      ) : (
        <div className="relative flex h-full min-h-0 flex-col">
          <MemoryCaptureCard
            sessionId={currentSession?.id ?? null}
            onSubmitted={async () => {
              await refreshSessions();
              await initialiseMemory();
            }}
          />
          <InteractiveCard
            state={
              interactiveState
                ? interactiveState.kind === "feedforward"
                  ? {
                      kind: "feedforward",
                      summary: interactiveState.summary,
                    }
                  : interactiveState.kind === "reflection"
                    ? {
                        kind: "reflection",
                        prompt: interactiveState.prompt,
                      }
                    : interactiveState.kind === "adjudication"
                      ? {
                          kind: "adjudication",
                          sections: interactiveState.sections,
                        }
                      : {
                          kind: "question",
                          question: interactiveState.question,
                          options: interactiveState.options,
                          allowFreeText: interactiveState.allowFreeText,
                        }
                : null
            }
            input={interactiveInput}
            setInput={setInteractiveInput}
            loading={chatLoading}
            onFeedforward={(action, note) => {
              void submitFeedforward(action, note);
            }}
            onReflection={(action) => {
              void submitReflection(action);
            }}
            onAdjudication={(action, note) => {
              void submitAdjudication(action, note);
            }}
            onQuestion={(answer) => {
              void submitQuestion(answer);
            }}
          />
          <div
            className={`min-h-0 flex-1 pr-0 transition-[padding] duration-200 ease-out ${inspector ? "lg:pr-[26rem]" : ""}`}
          >
            <ChatPane
              classRefs={classRefs}
              selectedClassRef={selectedClassRef}
              setSelectedClassRef={setSelectedClassRef}
              commands={commands}
              selectedCommandId={selectedCommandId}
              setSelectedCommandId={setSelectedCommandId}
              contextHistory={currentSession?.contextHistory ?? []}
              memoryContextHistory={currentSession?.memoryContextHistory ?? []}
              traceHistory={traceHistory}
              messages={messages}
              chatLoading={chatLoading}
              chatError={chatError}
              sessionError={sessionError}
              messageInput={messageInput}
              setMessageInput={setMessageInput}
              focusComposerToken={focusComposerToken}
              sessionLoading={sessionLoading}
              provider={provider}
              model={model}
              setProvider={(nextProvider) => {
                const fallbackModel = MODEL_OPTIONS[nextProvider][0];
                setProvider(nextProvider);
                setModel(fallbackModel);
              }}
              setModel={setModel}
              onInspectSkill={inspectSkill}
              onInspectWorkspacePath={inspectWorkspacePath}
              onInspectMemoryPath={inspectMemoryPath}
              onInspectReadFileTool={inspectReadFileTool}
              onInspectPrompt={inspectPrompt}
              onInspectRawResponse={inspectRawResponse}
              sendMessage={sendMessage}
              cancelMessage={cancelMessage}
              interactiveLocked={Boolean(interactiveState)}
            />
            {commandsError ? (
              <p className="mt-2 text-xs text-danger-700">{commandsError}</p>
            ) : null}
          </div>
          {inspectorPanel}
        </div>
      )}
    </Shell>
  );
}
