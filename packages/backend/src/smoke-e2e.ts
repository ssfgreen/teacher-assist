import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type RunningServer, startServer } from "./server";
import type { Provider } from "./types";

type ProviderTarget = {
  provider: Provider;
  model: string;
};

type SmokeCheck = {
  name: string;
  ok: boolean;
  details?: string;
};

type ChatApiResponse = {
  status?: string;
  sessionId: string;
  response: {
    content: string;
  };
  messages: ChatMessage[];
  approval?: {
    actionId: string;
    kind: "tool_call" | "skill_selection";
  };
};

const TERMINAL_STATUSES = new Set([
  "success",
  "no_new_memory",
  "awaiting_memory_capture",
  "awaiting_reflection",
  "awaiting_adjudication",
]);

let baseUrl = "";

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function login(): Promise<string> {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: "password123",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Login failed (${response.status}): ${await response.text()}`,
    );
  }
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.length > 0, "Auth cookie missing");
  return cookie;
}

async function postJson<T>(
  path: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string, cookie: string): Promise<T> {
  const response = await request(path, {
    headers: { cookie },
  });
  if (!response.ok) {
    throw new Error(
      `${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function runProviderChecks(
  target: ProviderTarget,
  cookie: string,
  maxTokens: number,
): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];

  const basic = await postJson<ChatApiResponse>("/api/chat", cookie, {
    provider: target.provider,
    model: target.model,
    approvalMode: "automation",
    maxTokens,
    messages: [{ role: "user", content: "Reply with exactly: smoke-ok" }],
  });
  checks.push({
    name: `${target.provider}:basic-chat`,
    ok: TERMINAL_STATUSES.has(basic.status ?? "success"),
    details: basic.status ?? "success",
  });

  let usedReadSkill = false;
  let toolStatus = "unknown";
  for (let attempt = 0; attempt < 2 && !usedReadSkill; attempt += 1) {
    const tool = await postJson<ChatApiResponse>("/api/chat", cookie, {
      provider: target.provider,
      model: target.model,
      approvalMode: "automation",
      maxTokens,
      messages: [
        {
          role: "user",
          content:
            "You must call the read_skill tool with target backward-design before any final answer. After the tool result, answer exactly: skill-read-ok",
        },
      ],
    });
    toolStatus = tool.status ?? "success";
    usedReadSkill = tool.messages.some(
      (message) => message.role === "tool" && message.toolName === "read_skill",
    );
  }
  checks.push({
    name: `${target.provider}:tool-calling-attempt`,
    ok: TERMINAL_STATUSES.has(toolStatus),
    details: usedReadSkill
      ? "read_skill tool call observed"
      : `no explicit read_skill call observed (status=${toolStatus})`,
  });

  const ffPause = await postJson<ChatApiResponse>("/api/chat", cookie, {
    provider: target.provider,
    model: target.model,
    approvalMode: "feedforward",
    maxTokens,
    messages: [{ role: "user", content: "Say hello in five words." }],
  });
  const paused =
    ffPause.status === "awaiting_approval" && Boolean(ffPause.approval);
  checks.push({
    name: `${target.provider}:feedforward-pauses`,
    ok: paused,
    details: ffPause.status ?? "missing-status",
  });

  if (ffPause.approval) {
    const resumed = await postJson<ChatApiResponse>(
      "/api/chat/approval-response",
      cookie,
      {
        sessionId: ffPause.sessionId,
        actionId: ffPause.approval.actionId,
        decision: "approve",
      },
    );
    checks.push({
      name: `${target.provider}:feedforward-resume`,
      ok:
        TERMINAL_STATUSES.has(resumed.status ?? "success") &&
        resumed.status !== "awaiting_approval",
      details: resumed.status ?? "success",
    });
  }

  return checks;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for smoke:e2e");
  }

  const openAiModel = process.env.SMOKE_OPENAI_MODEL ?? "gpt-5-nano-2025-08-07";
  const anthropicModel =
    process.env.SMOKE_ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  const maxTokens = Number(process.env.SMOKE_MAX_TOKENS ?? "96");

  const targets: ProviderTarget[] = [];
  if (process.env.OPENAI_API_KEY) {
    targets.push({ provider: "openai", model: openAiModel });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    targets.push({ provider: "anthropic", model: anthropicModel });
  }
  assert(
    targets.length > 0,
    "Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY to run smoke:e2e",
  );

  const server: RunningServer = await startServer(
    Number(process.env.SMOKE_PORT ?? 3004),
  );
  baseUrl = `http://127.0.0.1:${server.port}`;

  const startedAt = new Date().toISOString();
  const checks: SmokeCheck[] = [];

  try {
    const cookie = await login();
    const sessions = await getJson<Array<{ id: string }>>(
      "/api/sessions",
      cookie,
    );
    checks.push({
      name: "postgres:sessions-endpoint",
      ok: Array.isArray(sessions),
      details: `sessions=${sessions.length}`,
    });

    for (const target of targets) {
      const providerChecks = await runProviderChecks(target, cookie, maxTokens);
      checks.push(...providerChecks);
    }
  } finally {
    await server.close();
  }

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
  };

  const smokeDir = resolve(process.cwd(), ".data", "smoke");
  mkdirSync(smokeDir, { recursive: true });
  const logPath = resolve(
    smokeDir,
    `e2e-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  writeFileSync(logPath, JSON.stringify(summary, null, 2));

  for (const check of checks) {
    const prefix = check.ok ? "[OK]" : "[FAIL]";
    console.log(
      `${prefix} ${check.name}${check.details ? ` :: ${check.details}` : ""}`,
    );
  }
  console.log(`Smoke log written to: ${logPath}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
