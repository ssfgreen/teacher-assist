import * as authApi from "../api/auth";
import * as chatApi from "../api/chat";
import * as commandsApi from "../api/commands";
import * as memoryApi from "../api/memory";
import * as sessionsApi from "../api/sessions";
import * as skillsApi from "../api/skills";
import * as workspaceApi from "../api/workspace";
import { useAuthStore } from "../stores/authStore";
import { useMemoryStore } from "../stores/memoryStore";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { SessionRecord, TeacherProfile } from "../types";

export const teacher: TeacherProfile = {
  id: "t1",
  email: "teacher@example.com",
  name: "Demo Teacher",
  access: {
    traceViewer: true,
  },
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

  useMemoryStore.setState({
    tree: [],
    openFilePath: null,
    openFileContent: "",
    dirty: false,
    loading: false,
    saving: false,
    error: null,
    proposals: [],
    decisions: {},
  });

  localStorage.clear();
}

export function setupDefaultMocks(): void {
  vi.restoreAllMocks();
  resetStores();

  vi.mocked(authApi.me).mockRejectedValue(new Error("Unauthorized"));
  vi.mocked(authApi.login).mockResolvedValue({ teacher });
  vi.mocked(authApi.logout).mockResolvedValue({ ok: true });
  vi.mocked(commandsApi.listCommands).mockResolvedValue({
    commands: [
      {
        id: "create-lesson",
        label: "Create lesson",
        description: "Build a complete lesson draft.",
      },
      {
        id: "refine-lesson",
        label: "Refine lesson",
        description: "Refine an existing lesson draft.",
      },
    ],
  });

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
        maxTier: 3,
        tier3FileCount: 1,
        tier3Files: ["examples.md"],
        validation: {
          valid: true,
          issues: [],
        },
      },
      {
        name: "differentiation",
        description: "Plan supports and challenge pathways.",
        maxTier: 2,
        tier3FileCount: 0,
        tier3Files: [],
        validation: {
          valid: true,
          issues: [],
        },
      },
    ],
  });
  vi.mocked(skillsApi.readSkill).mockResolvedValue({
    target: "backward-design",
    tier: 2,
    content: "# Backward Design\n\nSkill file content.",
  });
  vi.mocked(memoryApi.listMemory).mockResolvedValue({
    tree: [
      {
        name: "MEMORY.md",
        path: "MEMORY.md",
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
                name: "MEMORY.md",
                path: "classes/3B/MEMORY.md",
                type: "file",
              },
            ],
          },
        ],
      },
    ],
  });
  vi.mocked(memoryApi.readMemoryFile).mockResolvedValue({
    path: "MEMORY.md",
    content: "# Teacher Memory",
  });
  vi.mocked(memoryApi.writeMemoryFile).mockResolvedValue({
    ok: true,
    path: "MEMORY.md",
  });
  vi.mocked(memoryApi.deleteMemoryFile).mockResolvedValue();

  vi.mocked(chatApi.sendChatStream).mockImplementation(
    async (_params, callbacks) => {
      callbacks.onDelta("Hello ");
      callbacks.onDelta("world");
      return {
        sessionId: "s1",
        messages: [
          { role: "user", content: "Plan loops" },
          { role: "assistant", content: "Hello world" },
        ],
        skillsLoaded: [],
        status: "success",
        trace: {
          id: "trace-1",
          sessionId: "s1",
          createdAt: "2026-02-28T00:00:00.000Z",
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 42,
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            estimatedCostUsd: 0.000006,
          },
          status: "success",
          steps: [],
          spans: [
            {
              id: "span-model",
              kind: "model",
              label: "model-turn",
              startedAt: "2026-02-28T00:00:00.000Z",
              endedAt: "2026-02-28T00:00:00.000Z",
              status: "success",
            },
          ],
          summary: {
            toolCalls: 0,
            hookCalls: 0,
            skillCalls: 0,
          },
        },
        workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
        memoryContextLoaded: ["MEMORY.md"],
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
  vi.mocked(chatApi.sendFeedforwardResponse).mockResolvedValue({
    sessionId: "s1",
    messages: [
      { role: "user", content: "Plan loops" },
      { role: "assistant", content: "Hello world" },
    ],
    skillsLoaded: [],
    status: "no_new_memory",
    trace: {
      id: "trace-feedforward",
      createdAt: "2026-02-28T00:00:00.000Z",
      systemPrompt: "<assistant-identity>Identity</assistant-identity>",
      estimatedPromptTokens: 42,
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        estimatedCostUsd: 0.000006,
      },
      status: "success",
      steps: [],
    },
    workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
    memoryContextLoaded: ["MEMORY.md"],
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
  });
  vi.mocked(chatApi.sendAdjudicationResponse).mockResolvedValue({
    sessionId: "s1",
    messages: [
      { role: "user", content: "Plan loops" },
      { role: "assistant", content: "Hello world" },
    ],
    skillsLoaded: [],
    status: "no_new_memory",
    trace: {
      id: "trace-adjudication",
      createdAt: "2026-02-28T00:00:00.000Z",
      systemPrompt: "<assistant-identity>Identity</assistant-identity>",
      estimatedPromptTokens: 42,
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        estimatedCostUsd: 0.000006,
      },
      status: "success",
      steps: [],
    },
    workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
    memoryContextLoaded: ["MEMORY.md"],
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
  });
  vi.mocked(chatApi.sendQuestionResponse).mockResolvedValue({
    sessionId: "s1",
    messages: [
      { role: "user", content: "Plan loops" },
      { role: "assistant", content: "Hello world" },
    ],
    skillsLoaded: [],
    status: "no_new_memory",
    trace: {
      id: "trace-question",
      createdAt: "2026-02-28T00:00:00.000Z",
      systemPrompt: "<assistant-identity>Identity</assistant-identity>",
      estimatedPromptTokens: 42,
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        estimatedCostUsd: 0.000006,
      },
      status: "success",
      steps: [],
    },
    workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
    memoryContextLoaded: ["MEMORY.md"],
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
  });
}
