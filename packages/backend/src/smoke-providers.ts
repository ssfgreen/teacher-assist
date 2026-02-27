import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createHandler } from "./server";

type ProviderTarget = {
  provider: "openai" | "anthropic";
  model: string;
};

type SmokeResult = {
  provider: string;
  model: string;
  prompt: string;
  stream: boolean;
  maxTokens: number;
  ok: boolean;
  status?: number;
  durationMs: number;
  responseText?: string;
  error?: string;
  rawSse?: string;
};

const BASE_URL = "http://localhost";
const WORDS = [
  "fern",
  "harbor",
  "sandstone",
  "thunder",
  "orbit",
  "compass",
  "copper",
  "echo",
];

function pickWord(): string {
  const idx = Math.floor(Math.random() * WORDS.length);
  return WORDS[idx];
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return createHandler(new Request(`${BASE_URL}${path}`, init));
}

function parseSse(raw: string): {
  text: string;
  donePayload: unknown | null;
  error: string | null;
} {
  const events = raw.split("\n\n").filter(Boolean);
  let text = "";
  let donePayload: unknown | null = null;
  let error: string | null = null;

  for (const rawEvent of events) {
    const lines = rawEvent.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));

    if (!eventLine || !dataLine) {
      continue;
    }

    const eventType = eventLine.slice("event:".length).trim();
    const parsed = JSON.parse(dataLine.slice("data:".length).trim()) as
      | { text?: string; error?: string }
      | { response?: { content?: string } };

    if (eventType === "delta" && typeof parsed.text === "string") {
      text += parsed.text;
    }

    if (eventType === "error" && typeof parsed.error === "string") {
      error = parsed.error;
    }

    if (eventType === "done") {
      donePayload = parsed;
    }
  }

  return { text, donePayload, error };
}

async function main(): Promise<void> {
  const openAiModel = process.env.SMOKE_OPENAI_MODEL ?? "gpt-5-nano-2025-08-07";
  const anthropicModel =
    process.env.SMOKE_ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  const maxTokens = Number(process.env.SMOKE_MAX_TOKENS ?? "80");

  const targets: ProviderTarget[] = [
    { provider: "openai", model: openAiModel },
    { provider: "anthropic", model: anthropicModel },
  ];

  const loginResponse = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.com",
      password: "password123",
    }),
  });

  if (loginResponse.status !== 200) {
    const body = await loginResponse.text();
    throw new Error(`Login failed: ${loginResponse.status} ${body}`);
  }

  const cookie = loginResponse.headers.get("set-cookie") ?? "";

  const results: SmokeResult[] = [];

  for (const target of targets) {
    const word = pickWord();
    const prompt = `Write me a haiku about ${word}.`;
    const started = Date.now();

    const response = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        provider: target.provider,
        model: target.model,
        stream: true,
        maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const durationMs = Date.now() - started;

    if (!response.ok) {
      results.push({
        provider: target.provider,
        model: target.model,
        prompt,
        stream: true,
        maxTokens,
        ok: false,
        status: response.status,
        durationMs,
        error: await response.text(),
      });
      continue;
    }

    const rawSse = await response.text();
    const parsed = parseSse(rawSse);

    if (parsed.error) {
      results.push({
        provider: target.provider,
        model: target.model,
        prompt,
        stream: true,
        maxTokens,
        ok: false,
        durationMs,
        responseText: parsed.text,
        error: parsed.error,
        rawSse,
      });
      continue;
    }

    results.push({
      provider: target.provider,
      model: target.model,
      prompt,
      stream: true,
      maxTokens,
      ok: true,
      durationMs,
      responseText: parsed.text,
      rawSse,
    });
  }

  const smokeDir = resolve(process.cwd(), ".data", "smoke");
  mkdirSync(smokeDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const logPath = resolve(smokeDir, `providers-${stamp}.json`);
  writeFileSync(logPath, JSON.stringify(results, null, 2));

  for (const result of results) {
    if (result.ok) {
      console.log(
        `[OK] ${result.provider}/${result.model} (${result.durationMs}ms) ${result.responseText}`,
      );
    } else {
      console.log(
        `[FAIL] ${result.provider}/${result.model} (${result.durationMs}ms) ${result.error}`,
      );
    }
  }

  console.log(`Smoke log written to: ${logPath}`);

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

void main();
