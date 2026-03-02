import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as chatApi from "./api/chat";
import * as skillsApi from "./api/skills";
import * as workspaceApi from "./api/workspace";
import { setupDefaultMocks, teacher } from "./test/app-fixtures";
import type { ChatApiResponse } from "./types";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");
vi.mock("./api/skills");
vi.mock("./api/memory");

beforeEach(() => {
  setupDefaultMocks();
});

describe("App auth and chat", () => {
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

    const helloMatches = await screen.findAllByText("Hello world");
    expect(helloMatches.length).toBeGreaterThan(0);
  });

  it("clears composer input immediately after submit", async () => {
    let resolveStream!: (value: ChatApiResponse) => void;
    const streamDone = new Promise<ChatApiResponse>((resolve) => {
      resolveStream = resolve;
    });

    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onContext?.({
          workspaceContextLoaded: ["soul.md"],
          memoryContextLoaded: ["MEMORY.md"],
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 12,
        });
        callbacks.onDelta("Working...");
        return streamDone;
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    expect((input as HTMLTextAreaElement).value).toBe("");

    resolveStream({
      sessionId: "s1",
      messages: [
        { role: "user", content: "Plan loops" },
        { role: "assistant", content: "Working... done" },
      ],
      skillsLoaded: [],
      status: "no_new_memory",
      trace: {
        id: "trace-input-clear",
        createdAt: "2026-03-02T00:00:00.000Z",
        systemPrompt: "<assistant-identity>Identity</assistant-identity>",
        estimatedPromptTokens: 12,
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          estimatedCostUsd: 0.000006,
        },
        status: "success",
        steps: [],
      },
      workspaceContextLoaded: ["soul.md"],
      memoryContextLoaded: ["MEMORY.md"],
      response: {
        content: "Working... done",
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
  });

  it("renders context and tool steps before stream completion", async () => {
    let resolveStream!: (value: ChatApiResponse) => void;
    const streamDone = new Promise<ChatApiResponse>((resolve) => {
      resolveStream = resolve;
    });

    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onContext?.({
          workspaceContextLoaded: ["soul.md", "classes/index.md"],
          memoryContextLoaded: ["MEMORY.md"],
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 12,
        });
        callbacks.onMessage?.({
          role: "tool",
          content: "ok",
          toolName: "read_skill",
          toolInput: { target: "backward-design" },
        });
        callbacks.onDelta("Hello ");
        return streamDone;
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = await screen.findByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await screen.findByText(/prompt embellished: context added/i);
    await screen.findByText(/read skill: backward-design/i);
    await screen.findByLabelText(/streaming cursor/i);

    resolveStream({
      sessionId: "s1",
      messages: [
        { role: "user", content: "Plan loops" },
        {
          role: "tool",
          content: "ok",
          toolName: "read_skill",
          toolInput: { target: "backward-design" },
        },
        { role: "assistant", content: "Hello world" },
      ],
      skillsLoaded: ["backward-design"],
      status: "success",
      trace: {
        id: "trace-stream-order",
        createdAt: "2026-03-02T00:00:00.000Z",
        systemPrompt: "<assistant-identity>Identity</assistant-identity>",
        estimatedPromptTokens: 12,
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          estimatedCostUsd: 0.000006,
        },
        status: "success",
        steps: [],
      },
      workspaceContextLoaded: ["soul.md", "classes/index.md"],
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

    await screen.findByText("Hello world");
  });

  it("uses selected provider and model for chat requests", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.selectOptions(screen.getByLabelText("Provider"), "anthropic");
    await user.selectOptions(
      screen.getByLabelText("Model"),
      "claude-sonnet-4-6",
    );

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

  it("shows context-added timeline entry only when context changes", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementation(
      async (params, callbacks) => {
        callbacks.onContext?.({
          workspaceContextLoaded: ["soul.md", "classes/3B/CLASS.md"],
          memoryContextLoaded: ["MEMORY.md"],
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 12,
        });
        callbacks.onDelta("Draft ready");
        return {
          sessionId: params.sessionId ?? "s1",
          messages: [
            ...(params.messages as Array<{
              role: "user" | "assistant";
              content: string;
            }>),
            { role: "assistant", content: "Draft ready" },
          ],
          skillsLoaded: [],
          status: "no_new_memory",
          trace: {
            id: `trace-${Math.random()}`,
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 12,
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
            content: "Draft ready",
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

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "First request{enter}");
    await screen.findByText("Draft ready");
    await user.type(input, "Second request{enter}");
    await waitFor(() => {
      expect(chatApi.sendChatStream).toHaveBeenCalledTimes(2);
    });

    const matches = screen.getAllByText("prompt embellished: context added");
    expect(matches).toHaveLength(1);
  });

  it("renders tool call blocks and marks loaded skill as active", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Draft ");
        callbacks.onDelta("ready");
        return {
          sessionId: "s1",
          skillsLoaded: ["backward-design"],
          messages: [
            { role: "user", content: "Plan a lesson" },
            {
              role: "tool",
              content:
                "Skill: backward-design\\nTier: 2\\n\\n# Backward Design",
              toolName: "read_skill",
              toolInput: { target: "backward-design" },
            },
            { role: "assistant", content: "Draft ready" },
          ],
          workspaceContextLoaded: ["soul.md"],
          trace: {
            id: "trace-tool-test",
            createdAt: "2026-02-28T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 12,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [
              {
                toolName: "read_skill",
                input: { target: "backward-design" },
                output: "ok",
                isError: false,
              },
            ],
          },
          response: {
            content: "Draft ready",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan lesson{enter}");

    await screen.findByText(/read skill: backward-design/i);
    await user.click(screen.getByRole("button", { name: "Skills" }));
    await screen.findByText("Active");
  });

  it("loads full skill file from the skills section", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: "Skills" }));
    await user.click(screen.getByText("backward-design"));

    await waitFor(() => {
      expect(skillsApi.readSkill).toHaveBeenCalledWith("backward-design");
    });
    await screen.findByText(/Backward Design/i);
  });

  it("collapses and expands sidebar sections from their headers", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    expect(screen.queryByRole("button", { name: /^soul\.md$/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await screen.findByRole("button", { name: /^soul\.md$/i });

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    expect(screen.queryByRole("button", { name: /^soul\.md$/i })).toBeNull();
  });

  it("groups consecutive skill reads under reading skills", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Done");
        return {
          sessionId: "s-grouped-skills",
          skillsLoaded: ["backward-design", "differentiation"],
          messages: [
            { role: "user", content: "Plan with skills" },
            {
              role: "tool",
              content: "ok",
              toolName: "read_skill",
              toolInput: { target: "backward-design" },
            },
            {
              role: "tool",
              content: "ok",
              toolName: "read_skill",
              toolInput: { target: "differentiation" },
            },
            { role: "assistant", content: "Done" },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-grouped-skills",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Done",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan with skills{enter}");

    const grouped = await screen.findByText(/reading skills/i);
    await user.click(grouped);
    await screen.findByText(/read skill: backward-design/i);
    await screen.findByText(/read skill: differentiation/i);
  });

  it("opens right inspector when clicking a grouped skill item", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Done");
        return {
          sessionId: "s-inspector-skill",
          skillsLoaded: ["backward-design", "differentiation"],
          messages: [
            { role: "user", content: "Plan with grouped skills" },
            {
              role: "tool",
              content: "ok",
              toolName: "read_skill",
              toolInput: { target: "backward-design" },
            },
            {
              role: "tool",
              content: "ok",
              toolName: "read_skill",
              toolInput: { target: "differentiation" },
            },
            { role: "assistant", content: "Done" },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-inspector-skill",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Done",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan with grouped skills{enter}");

    const grouped = await screen.findByText(/reading skills/i);
    await user.click(grouped);
    expect(screen.queryByTestId("right-inspector")).not.toBeInTheDocument();
    await user.click(await screen.findByText(/read skill: backward-design/i));
    expect(screen.getByTestId("right-inspector")).toBeInTheDocument();
    await screen.findByText("Skill file content.");
  });

  it("opens right inspector when clicking a grouped read file item", async () => {
    vi.mocked(workspaceApi.readWorkspaceFile).mockResolvedValueOnce({
      path: "teacher.md",
      content: "# Teacher Profile\n\nDetails",
    });
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Done");
        return {
          sessionId: "s-inspector-read-file",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Inspect files" },
            {
              role: "tool",
              content: "# teacher file",
              toolName: "read_file",
              toolInput: { path: "teacher.md" },
            },
            {
              role: "tool",
              content: "# pedagogy file",
              toolName: "read_file",
              toolInput: { path: "pedagogy.md" },
            },
            { role: "assistant", content: "Done" },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-inspector-read-file",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Done",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Inspect files{enter}");

    const grouped = await screen.findByText(/exploring files/i);
    await user.click(grouped);
    await user.click(await screen.findByText(/read file: teacher\.md/i));
    await screen.findByRole("heading", { name: /teacher profile/i });
    await screen.findByText(/details/i);
    expect(screen.queryByText(/tool invoked/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\"path\": \"teacher\.md\"/i),
    ).not.toBeInTheDocument();
  });

  it("shows generated prompt and trace steps", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await screen.findByText("Assistant response");
    await user.click(screen.getByText("Assistant response"));
    const tokenBadges = await screen.findAllByLabelText(
      /Prompt: 1, Response: 2, Total: 3/i,
    );
    expect(tokenBadges.length).toBeGreaterThan(0);
  });

  it("opens full prompt text in the right inspector", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Ready.");
        return {
          sessionId: "s-full-prompt",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Show prompt" },
            { role: "assistant", content: "Ready." },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-full-prompt",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt:
              "<assistant-identity>Identity</assistant-identity>\n<workspace-context>teacher.md</workspace-context>",
            estimatedPromptTokens: 11,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Ready.",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Show prompt{enter}");

    await user.click(
      await screen.findByRole("button", { name: /view full prompt/i }),
    );
    await screen.findByText(
      /<assistant-identity>Identity<\/assistant-identity>/i,
    );
    await screen.findByText(
      /<workspace-context>teacher\.md<\/workspace-context>/i,
    );
  });

  it("opens raw model response text in the right inspector", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("## Plan\nLine one\nLine two");
        return {
          sessionId: "s-raw-response",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Show raw response" },
            {
              role: "assistant",
              content: "## Plan\nLine one\nLine two",
            },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-raw-response",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 11,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "## Plan\nLine one\nLine two",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Show raw response{enter}");

    await user.click(
      await screen.findByRole("button", { name: /view raw response/i }),
    );

    await screen.findByText(/## Plan/i, { selector: "pre" });
    await screen.findByText(/Line one/i, { selector: "pre" });
    await screen.findByText(/Line two/i, { selector: "pre" });
  });

  it("inspects virtual workspace context files without workspace read errors", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Ready.");
        return {
          sessionId: "s-virtual-context",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Use context" },
            { role: "assistant", content: "Ready." },
          ],
          workspaceContextLoaded: ["classes/catalog.md"],
          trace: {
            id: "trace-virtual-context",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 11,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Ready.",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Use context{enter}");

    const contextSummary = await screen.findByText(
      /prompt embellished: context added/i,
    );
    await user.click(contextSummary);
    await user.click(await screen.findByText(/classes\/catalog\.md/i));

    await screen.findByText(/Available class references: 3B/i);
    expect(
      screen.queryByText(/workspace file not found/i),
    ).not.toBeInTheDocument();
  });

  it("shows thinking state while waiting for the final model response", async () => {
    let releaseStream!: (value: ChatApiResponse) => void;
    const pendingStream = new Promise<ChatApiResponse>((resolve) => {
      releaseStream = resolve;
    });

    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      () => pendingStream,
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    const thinkingRows = await screen.findAllByText("Thinking...");
    expect(thinkingRows.length).toBeGreaterThan(0);
    expect(screen.queryByText("Assistant response")).not.toBeInTheDocument();

    releaseStream({
      sessionId: "s-thinking",
      skillsLoaded: [],
      messages: [
        { role: "user", content: "Plan loops" },
        { role: "assistant", content: "Ready." },
      ],
      workspaceContextLoaded: [],
      trace: {
        id: "trace-thinking-test",
        createdAt: "2026-03-02T00:00:00.000Z",
        systemPrompt: "<assistant-identity>Identity</assistant-identity>",
        estimatedPromptTokens: 10,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          estimatedCostUsd: 0.000004,
        },
        status: "success",
        steps: [],
      },
      response: {
        content: "Ready.",
        toolCalls: [],
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          estimatedCostUsd: 0.000004,
        },
        stopReason: "stop",
      },
    });

    await screen.findByText("Assistant response");
  });

  it("shows full final model response without truncating the summary", async () => {
    const finalSentence = "This final sentence must remain visible.";
    const longResponse = [
      "This response is intentionally long so the summary line would previously be cut.",
      "It should remain complete in the Final model response row.",
      "The UI must not truncate this content to 160 characters anymore.",
      finalSentence,
    ].join(" ");

    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Drafting...");
        return {
          sessionId: "s-full-response",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Give me full output" },
            { role: "assistant", content: longResponse },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-full-response-test",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: longResponse,
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Give me full output{enter}");

    await screen.findByText("Assistant response");
    const visibleTail = await screen.findAllByText(/must remain visible/i);
    expect(visibleTail.length).toBeGreaterThan(0);
  });

  it("renders assistant lesson sections as distinct blocks", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta("Lesson ");
        callbacks.onDelta("ready");
        return {
          sessionId: "s-sections",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Create a lesson" },
            {
              role: "assistant",
              content: [
                "## Starter",
                "Quick retrieval check.",
                "",
                "## Main Activity",
                "Pairs debug a loop example.",
                "",
                "## Plenary",
                "Exit ticket reflection.",
              ].join("\n"),
            },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-sections-test",
            createdAt: "2026-02-28T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "Lesson ready",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Create sectioned lesson{enter}");

    await screen.findByRole("heading", { name: "Starter" });
    await screen.findByRole("heading", { name: "Main Activity" });
    await screen.findByRole("heading", { name: "Plenary" });
  });

  it("renders assistant markdown with single-line breaks", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta(
          "## Plan\nLine one\nLine two\n\n**Bold** and *italic*.",
        );
        return {
          sessionId: "s-markdown-breaks",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Format this" },
            {
              role: "assistant",
              content: "## Plan\nLine one\nLine two\n\n**Bold** and *italic*.",
            },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-markdown-breaks",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "ok",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Format this{enter}");

    await screen.findByRole("heading", { name: "Plan" });
    await screen.findByText(/bold/i);
    const lineBreaks = container.querySelectorAll("br");
    expect(lineBreaks.length).toBeGreaterThan(0);
  });

  it("renders markdown bullet lists in assistant responses", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, callbacks) => {
        callbacks.onDelta(
          "Two core MCQs (S1 trig focus)\n- MCQ 1\n  Question: What is sin A?\n  A) 3/6\n  Answer: A\n- MCQ 2\n  Question: What is tan B?\n  Answer: C",
        );
        return {
          sessionId: "s-markdown-lists",
          skillsLoaded: [],
          messages: [
            { role: "user", content: "Format bullets" },
            {
              role: "assistant",
              content:
                "Two core MCQs (S1 trig focus)\n- MCQ 1\n  Question: What is sin A?\n  A) 3/6\n  Answer: A\n- MCQ 2\n  Question: What is tan B?\n  Answer: C",
            },
          ],
          workspaceContextLoaded: [],
          trace: {
            id: "trace-markdown-lists",
            createdAt: "2026-03-02T00:00:00.000Z",
            systemPrompt: "<assistant-identity>Identity</assistant-identity>",
            estimatedPromptTokens: 10,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            status: "success",
            steps: [],
          },
          response: {
            content: "ok",
            toolCalls: [],
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              estimatedCostUsd: 0.000004,
            },
            stopReason: "stop",
          },
        };
      },
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Format bullets{enter}");

    const listItems = await screen.findAllByRole("listitem");
    expect(listItems.length).toBeGreaterThanOrEqual(2);
    await screen.findByText(/MCQ 1/i);
    await screen.findByText(/MCQ 2/i);
  });
});
