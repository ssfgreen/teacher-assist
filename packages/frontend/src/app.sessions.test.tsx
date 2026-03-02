import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as sessionsApi from "./api/sessions";
import { setupDefaultMocks, teacher } from "./test/app-fixtures";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/sessions");
vi.mock("./api/workspace");
vi.mock("./api/skills");
vi.mock("./api/memory");

beforeEach(() => {
  setupDefaultMocks();
});

async function openWorkspaceSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Workspace" }));
}

async function openSkillsSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Skills" }));
}

describe("App sessions", () => {
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
      screen.getByRole("button", {
        name: /^Existing starter prompt just now$/i,
      }),
    );

    const resumed = await screen.findAllByText("Loaded session response");
    expect(resumed.length).toBeGreaterThan(0);
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
      screen.getByRole("button", {
        name: /^Existing starter prompt just now$/i,
      }),
    );

    const sessionCardButton = screen.getByRole("button", {
      name: /^Existing starter prompt just now$/i,
    });
    expect(sessionCardButton.parentElement?.parentElement?.className).toContain(
      "border-accent-500",
    );

    await openWorkspaceSection(user);
    await user.click(screen.getByRole("button", { name: /^soul\.md$/i }));
    await screen.findByText("Editing soul.md");

    const refreshedSessionCardButton = screen.getByRole("button", {
      name: /^Existing starter prompt just now$/i,
    });
    expect(
      refreshedSessionCardButton.parentElement?.parentElement?.className,
    ).not.toContain("border-accent-500");
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
    await openWorkspaceSection(user);
    await user.click(screen.getByRole("button", { name: /^soul\.md$/i }));
    await screen.findByText("Editing soul.md");

    await user.click(
      screen.getByRole("button", {
        name: /^Existing starter prompt just now$/i,
      }),
    );

    await screen.findByPlaceholderText("Type your message...");
    const loaded = await screen.findAllByText("Loaded session response");
    expect(loaded.length).toBeGreaterThan(0);
  });

  it("restores persisted context and trace metadata when reopening a session", async () => {
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
      traceHistory: [
        {
          id: "trace-persisted",
          createdAt: now,
          systemPrompt: "<assistant-identity>Identity</assistant-identity>",
          estimatedPromptTokens: 33,
          usage: {
            inputTokens: 12,
            outputTokens: 6,
            totalTokens: 18,
            estimatedCostUsd: 0.000036,
          },
          status: "success",
          steps: [
            { toolName: "read_skill", input: {}, output: "ok", isError: false },
          ],
        },
      ],
      contextHistory: [["soul.md", "classes/index.md"]],
      activeSkills: ["backward-design"],
      createdAt: now,
      updatedAt: now,
    });

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Existing starter prompt");
    await user.click(
      screen.getByRole("button", {
        name: /^Existing starter prompt just now$/i,
      }),
    );

    await screen.findByText(/prompt embellished: context added/i);
    await screen.findByText("Assistant response");

    await openSkillsSection(user);
    await screen.findByText("Active");
  });

  it("switches back to chat view when creating a new session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Demo Teacher");
    await openWorkspaceSection(user);
    await user.click(screen.getByRole("button", { name: /^soul\.md$/i }));
    await screen.findByText("Editing soul.md");

    await user.click(screen.getByRole("button", { name: /New Session/i }));

    const input = await screen.findByPlaceholderText("Type your message...");
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });
});
