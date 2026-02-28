import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as chatApi from "./api/chat";
import * as sessionsApi from "./api/sessions";
import * as workspaceApi from "./api/workspace";
import { useAuthStore } from "./stores/authStore";
import { useSessionStore } from "./stores/sessionStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import type { SessionRecord, TeacherProfile } from "./types";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");

const teacher: TeacherProfile = {
  id: "t1",
  email: "teacher@example.com",
  name: "Demo Teacher",
};

function resetStores(): void {
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
  });

  localStorage.clear();
}

beforeEach(() => {
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

  vi.mocked(chatApi.sendChatStream).mockImplementation(
    async (_params, onDelta) => {
      onDelta("Hello ");
      onDelta("world");
      return {
        sessionId: "s1",
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
});

describe("App critical path", () => {
  it("handles login and streams chat response on Enter", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Demo Teacher");

    const input = await screen.findByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    await screen.findByText("Hello world");
  });

  it("resumes a session when selected", async () => {
    const now = new Date().toISOString();
    vi.mocked(authApi.me).mockResolvedValue(teacher);
    vi.mocked(sessionsApi.listSessions).mockResolvedValue([
      {
        id: "s-existing",
        teacherId: teacher.id,
        provider: "openai",
        model: "mock-openai",
        messages: [{ role: "user", content: "Existing starter prompt" }],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    vi.mocked(sessionsApi.readSession).mockResolvedValue({
      id: "s-existing",
      teacherId: teacher.id,
      provider: "openai",
      model: "mock-openai",
      messages: [
        { role: "user", content: "Existing starter prompt" },
        { role: "assistant", content: "Loaded session response" },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Existing starter prompt");
    await user.click(
      screen.getByRole("button", { name: /Existing starter prompt/i }),
    );

    await screen.findByText("Loaded session response");
  });

  it("does not highlight session cards while editing a workspace file", async () => {
    const now = new Date().toISOString();
    vi.mocked(authApi.me).mockResolvedValue(teacher);
    vi.mocked(sessionsApi.listSessions).mockResolvedValue([
      {
        id: "s-existing",
        teacherId: teacher.id,
        provider: "openai",
        model: "mock-openai",
        messages: [{ role: "user", content: "Existing starter prompt" }],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    vi.mocked(sessionsApi.readSession).mockResolvedValue({
      id: "s-existing",
      teacherId: teacher.id,
      provider: "openai",
      model: "mock-openai",
      messages: [
        { role: "user", content: "Existing starter prompt" },
        { role: "assistant", content: "Loaded session response" },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Existing starter prompt");
    await user.click(
      screen.getByRole("button", { name: /Existing starter prompt/i }),
    );

    const sessionCardButton = screen.getByRole("button", {
      name: /Existing starter prompt/i,
    });
    expect(sessionCardButton.parentElement?.className).toContain(
      "border-accent-600",
    );

    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));
    await screen.findByText("Editing soul.md");

    expect(sessionCardButton.parentElement?.className).not.toContain(
      "border-accent-600",
    );
  });

  it("uses selected provider and model for chat requests", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "anthropic");
    await user.selectOptions(selects[1], "claude-sonnet-4-6");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Use anthropic{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0][0]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("shows auth and chat errors", async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(
      new Error("Invalid credentials"),
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Invalid credentials");

    vi.mocked(authApi.login).mockResolvedValueOnce({ teacher });
    vi.mocked(chatApi.sendChatStream).mockRejectedValueOnce(
      new Error("Chat failed"),
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Trigger error{enter}");

    await screen.findByText("Chat failed");
  });

  it("opens workspace file and shows context indicator metadata", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));

    await waitFor(() => {
      expect(workspaceApi.readWorkspaceFile).toHaveBeenCalledWith("soul.md");
    });
    await screen.findByText("Assistant Identity");

    expect(screen.queryByPlaceholderText("Type your message...")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to chat" }));

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops for 3B{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0]?.[0]).toMatchObject({
      classRef: undefined,
    });

    await screen.findByRole("button", { name: /Used context/i });
  });

  it("passes selected class reference to chat API", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.selectOptions(screen.getByLabelText("Class context"), "3B");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(chatApi.sendChatStream).mock.calls[0]?.[0]).toMatchObject({
      classRef: "3B",
    });
  });

  it("opens chat when selecting a session while editor is open", async () => {
    const now = new Date().toISOString();
    vi.mocked(authApi.me).mockResolvedValue(teacher);
    vi.mocked(sessionsApi.listSessions).mockResolvedValue([
      {
        id: "s-existing",
        teacherId: teacher.id,
        provider: "openai",
        model: "mock-openai",
        messages: [{ role: "user", content: "Existing starter prompt" }],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    vi.mocked(sessionsApi.readSession).mockResolvedValue({
      id: "s-existing",
      teacherId: teacher.id,
      provider: "openai",
      model: "mock-openai",
      messages: [
        { role: "user", content: "Existing starter prompt" },
        { role: "assistant", content: "Loaded session response" },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Demo Teacher");
    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));
    await screen.findByText("Editing soul.md");

    await user.click(
      screen.getByRole("button", { name: /Existing starter prompt/i }),
    );

    await screen.findByPlaceholderText("Type your message...");
    await screen.findByText("Loaded session response");
  });

  it("creates a file inside the selected folder", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("3C/CLASS.md");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: "New File" }));

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "classes/3C/CLASS.md",
        expect.stringContaining("# New file"),
      );
    });

    promptSpy.mockRestore();
  });

  it("creates a folder inside the selected folder", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("cfe");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: /curriculum/i }));
    await user.click(screen.getByRole("button", { name: "New Folder" }));

    await waitFor(() => {
      expect(workspaceApi.writeWorkspaceFile).toHaveBeenCalledWith(
        "curriculum/cfe/README.md",
        expect.stringContaining("# Folder Notes"),
      );
    });

    promptSpy.mockRestore();
  });

  it("renames the selected workspace item", async () => {
    const user = userEvent.setup();
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("CLASS-RENAMED.md");

    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: "CLASS.md" }));
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(workspaceApi.renameWorkspacePath).toHaveBeenCalledWith(
        "classes/3B/CLASS.md",
        "classes/3B/CLASS-RENAMED.md",
      );
    });

    promptSpy.mockRestore();
  });
});
