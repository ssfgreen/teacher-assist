import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import * as authApi from "./api/auth";
import * as sessionsApi from "./api/sessions";
import * as tracesApi from "./api/traces";
import { setupDefaultMocks, teacher } from "./test/app-fixtures";

vi.mock("./api/auth");
vi.mock("./api/chat");
vi.mock("./api/commands");
vi.mock("./api/sessions");
vi.mock("./api/workspace");
vi.mock("./api/skills");
vi.mock("./api/memory");
vi.mock("./api/traces");

beforeEach(() => {
  setupDefaultMocks();
});

describe("App traces", () => {
  it("opens session trace viewer from sessions list", async () => {
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
    vi.mocked(tracesApi.listSessionTraces).mockResolvedValue({
      traces: [
        {
          id: "trace-1",
          sessionId: "s-existing",
          createdAt: now,
          systemPrompt: "SYSTEM",
          estimatedPromptTokens: 22,
          usage: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
            estimatedCostUsd: 0.000042,
          },
          status: "success",
          steps: [],
          spans: [
            {
              id: "span-tool",
              kind: "tool",
              label: "read_skill",
              startedAt: now,
              endedAt: now,
              status: "success",
              metadata: { cacheHit: false },
            },
          ],
          summary: {
            toolCalls: 1,
            hookCalls: 0,
            skillCalls: 1,
          },
          session: {
            id: "s-existing",
            provider: "openai",
            model: "mock-openai",
            classRef: "3B",
            updatedAt: now,
          },
        },
      ],
    });
    vi.mocked(tracesApi.readTrace).mockImplementation(async (traceId) => {
      const response = await tracesApi.listSessionTraces("s-existing");
      return (
        response.traces.find((trace) => trace.id === traceId) ??
        response.traces[0]
      );
    });

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Existing starter prompt");
    await user.click(screen.getByRole("button", { name: "Traces" }));

    await screen.findByText("Session Traces");
    await screen.findByText("Tool calls");
    await screen.findByText("$0.000042");
    expect(tracesApi.listSessionTraces).toHaveBeenCalledWith("s-existing");
  });

  it("filters and expands trace spans", async () => {
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
    vi.mocked(tracesApi.listSessionTraces).mockResolvedValue({
      traces: [
        {
          id: "trace-2",
          sessionId: "s-existing",
          createdAt: now,
          systemPrompt: "SYSTEM",
          estimatedPromptTokens: 30,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            estimatedCostUsd: 0.00003,
          },
          status: "success",
          steps: [],
          spans: [
            {
              id: "span-model",
              kind: "model",
              label: "model-turn",
              startedAt: now,
              endedAt: now,
              status: "success",
            },
            {
              id: "span-skill",
              kind: "skill",
              label: "read_skill:backward-design",
              startedAt: now,
              endedAt: now,
              status: "success",
              metadata: {
                target: "backward-design",
              },
            },
          ],
          summary: {
            toolCalls: 0,
            hookCalls: 0,
            skillCalls: 1,
          },
          session: {
            id: "s-existing",
            provider: "openai",
            model: "mock-openai",
            classRef: "3B",
            updatedAt: now,
          },
        },
      ],
    });
    vi.mocked(tracesApi.readTrace).mockResolvedValue(
      (await tracesApi.listSessionTraces("s-existing")).traces[0],
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Existing starter prompt");
    await user.click(screen.getByRole("button", { name: "Traces" }));

    await user.click(screen.getByRole("button", { name: "Skill" }));
    expect(screen.queryByText("model-turn")).not.toBeInTheDocument();

    const skillSpan = await screen.findByText("read_skill:backward-design");
    await user.click(skillSpan);
    await screen.findByText(/"target": "backward-design"/i);
  });
});
