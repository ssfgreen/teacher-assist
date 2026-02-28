import * as authApi from "../api/auth";
import * as chatApi from "../api/chat";
import * as sessionsApi from "../api/sessions";
import * as skillsApi from "../api/skills";
import * as workspaceApi from "../api/workspace";
import { useAuthStore } from "../stores/authStore";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { SessionRecord, TeacherProfile } from "../types";

export const teacher: TeacherProfile = {
  id: "t1",
  email: "teacher@example.com",
  name: "Demo Teacher",
};

export function resetStores(): void {
  useAuthStore.setState({
    teacher: null,
    loading: false,
    error: null,
  });

  useSessionStore.setState({
    sessions: [],
    currentSession: null,
    provider: "openai",
    model: "mock-openai",
    loading: false,
    error: null,
  });

  useWorkspaceStore.setState({
    tree: [],
    classRefs: [],
    openFilePath: null,
    openFileContent: "",
    dirty: false,
    loading: false,
    saving: false,
    error: null,
    expandedFolders: {
      classes: true,
      curriculum: true,
    },
    canUndoReset: false,
  });

  localStorage.clear();
}

export function setupDefaultMocks(): void {
  vi.restoreAllMocks();
  resetStores();

  vi.mocked(authApi.me).mockRejectedValue(new Error("Unauthorized"));
  vi.mocked(authApi.login).mockResolvedValue({ teacher });
  vi.mocked(authApi.logout).mockResolvedValue({ ok: true });

  vi.mocked(sessionsApi.listSessions).mockResolvedValue([]);
  vi.mocked(sessionsApi.createSession).mockImplementation(
    async (provider, model) => {
      const now = new Date().toISOString();
      return {
        id: "s1",
        teacherId: teacher.id,
        provider,
        model,
        messages: [],
        createdAt: now,
        updatedAt: now,
      } satisfies SessionRecord;
    },
  );
  vi.mocked(sessionsApi.readSession).mockRejectedValue(new Error("Not found"));
  vi.mocked(sessionsApi.removeSession).mockResolvedValue();

  vi.mocked(workspaceApi.listWorkspace).mockResolvedValue({
    tree: [
      {
        name: "soul.md",
        path: "soul.md",
        type: "file",
      },
      {
        name: "classes",
        path: "classes",
        type: "directory",
        children: [
          {
            name: "3B",
            path: "classes/3B",
            type: "directory",
            children: [
              {
                name: "CLASS.md",
                path: "classes/3B/CLASS.md",
                type: "file",
              },
            ],
          },
        ],
      },
      {
        name: "curriculum",
        path: "curriculum",
        type: "directory",
        children: [
          {
            name: "README.md",
            path: "curriculum/README.md",
            type: "file",
          },
        ],
      },
    ],
    classRefs: ["3B"],
  });
  vi.mocked(workspaceApi.seedWorkspace).mockResolvedValue({ ok: true });
  vi.mocked(workspaceApi.resetWorkspace).mockResolvedValue({ ok: true });
  vi.mocked(workspaceApi.readWorkspaceFile).mockResolvedValue({
    path: "soul.md",
    content: "# Assistant Identity",
  });
  vi.mocked(workspaceApi.writeWorkspaceFile).mockResolvedValue({
    ok: true,
    path: "soul.md",
  });
  vi.mocked(workspaceApi.deleteWorkspaceFile).mockResolvedValue();
  vi.mocked(workspaceApi.renameWorkspacePath).mockResolvedValue({
    ok: true,
    fromPath: "classes/3B/CLASS.md",
    toPath: "classes/3B/CLASS-RENAMED.md",
    renamedCount: 1,
  });
  vi.mocked(skillsApi.listSkills).mockResolvedValue({
    skills: [
      {
        name: "backward-design",
        description: "Design lessons from outcomes to evidence to activities.",
      },
      {
        name: "differentiation",
        description: "Plan supports and challenge pathways.",
      },
    ],
  });
  vi.mocked(skillsApi.readSkill).mockResolvedValue({
    target: "backward-design",
    tier: 2,
    content: "# Backward Design\n\nSkill file content.",
  });

  vi.mocked(chatApi.sendChatStream).mockImplementation(
    async (_params, onDelta) => {
      onDelta("Hello ");
      onDelta("world");
      return {
        sessionId: "s1",
        messages: [
          { role: "user", content: "Plan loops" },
          { role: "assistant", content: "Hello world" },
        ],
        skillsLoaded: [],
        trace: {
          id: "trace-1",
          createdAt: "2026-02-28T00:00:00.000Z",
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 42,
          status: "success",
          steps: [],
        },
        workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
        response: {
          content: "Hello world",
          toolCalls: [],
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            estimatedCostUsd: 0.000006,
          },
          stopReason: "stop",
        },
      };
    },
  );
}
