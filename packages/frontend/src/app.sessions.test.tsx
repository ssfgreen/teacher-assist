import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  setupDefaultMocks();
});

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

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));
    await screen.findByText("Editing soul.md");

    await user.click(screen.getByRole("button", { name: "Sessions" }));
    const refreshedSessionCardButton = screen.getByRole("button", {
      name: /Existing starter prompt/i,
    });
    expect(refreshedSessionCardButton.parentElement?.className).not.toContain(
      "border-accent-600",
    );
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
    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("button", { name: /✦ soul.md/i }));
    await screen.findByText("Editing soul.md");

    await user.click(screen.getByRole("button", { name: "Sessions" }));
    await user.click(
      screen.getByRole("button", { name: /Existing starter prompt/i }),
    );

    await screen.findByPlaceholderText("Type your message...");
    await screen.findByText("Loaded session response");
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
      screen.getByRole("button", { name: /Existing starter prompt/i }),
    );

    await screen.findByRole("button", { name: /Used context \(2\)/i });
    await screen.findByRole("button", { name: /Trace log \(1\)/i });

    await user.click(screen.getByRole("button", { name: "Skills" }));
    await screen.findByText("Active");
  });
});
