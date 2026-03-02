import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as chatApi from "./api/chat";
import * as skillsApi from "./api/skills";
import { setupDefaultMocks, teacher } from "./test/app-fixtures";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");
vi.mock("./api/skills");

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

  it("renders tool call blocks and marks loaded skill as active", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, onDelta) => {
        onDelta("Draft ");
        onDelta("ready");
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

    await screen.findByText("Skill read");
    await user.click(screen.getByText("read_skill backward-design"));
    await screen.findByText("Arguments");
    await screen.findByText("Result");

    await user.click(screen.getByRole("button", { name: "Skills" }));
    await screen.findByText("Active");
  });

  it("loads full skill file from the skills tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    await user.click(screen.getByRole("button", { name: "Skills" }));
    await user.click(screen.getByRole("button", { name: "backward-design" }));

    await waitFor(() => {
      expect(skillsApi.readSkill).toHaveBeenCalledWith("backward-design");
    });
    await screen.findByText(/Backward Design/i);
  });

  it("shows generated prompt and trace steps", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await screen.findByText("Final model response");
    await user.click(screen.getByText("Final model response"));
    await screen.findByText("Call Details");
    const promptTokenRows = await screen.findAllByText(/Prompt tokens/i);
    expect(promptTokenRows.length).toBeGreaterThan(0);
  });

  it("shows thinking state while waiting for the final model response", async () => {
    let resolveStream:
      | ((value: Awaited<ReturnType<typeof chatApi.sendChatStream>>) => void)
      | null = null;

    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");

    const input = screen.getByPlaceholderText("Type your message...");
    await user.type(input, "Plan loops{enter}");

    await screen.findByText("Thinking");
    const thinkingRows = await screen.findAllByText("Thinking...");
    expect(thinkingRows.length).toBeGreaterThan(0);
    expect(screen.queryByText("Final model response")).not.toBeInTheDocument();

    resolveStream?.({
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

    await screen.findByText("Final model response");
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
      async (_params, onDelta) => {
        onDelta("Drafting...");
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

    await screen.findByText("Final model response");
    const visibleTail = await screen.findAllByText(/must remain visible/i);
    expect(visibleTail.length).toBeGreaterThan(0);
  });

  it("renders assistant lesson sections as distinct blocks", async () => {
    vi.mocked(chatApi.sendChatStream).mockImplementationOnce(
      async (_params, onDelta) => {
        onDelta("Lesson ");
        onDelta("ready");
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

    await screen.findByText("Starter");
    const sectionCards = await screen.findAllByTestId("assistant-section");
    expect(sectionCards.length).toBe(3);
  });
});
