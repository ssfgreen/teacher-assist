import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import bcrypt from "bcrypt";

import { resetAuthSeedForTests } from "../src/auth";
import { createHandler } from "../src/server";
import { createAuthToken, resetStores, upsertTeacher } from "../src/store";

const baseUrl = "http://localhost";

async function request(path: string, init?: RequestInit): Promise<Response> {
  return createHandler(new Request(`${baseUrl}${path}`, init));
}

describe("server integration", () => {
  beforeEach(() => {
    resetStores();
    resetAuthSeedForTests();
  });

  afterEach(() => {
    resetStores();
    resetAuthSeedForTests();
  });

  it("requires auth for protected endpoints", async () => {
    const response = await request("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("supports login, me, and logout", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });

    expect(loginResponse.status).toBe(200);
    const cookie = loginResponse.headers.get("set-cookie");
    expect(Boolean(cookie)).toBe(true);

    const meResponse = await request("/api/auth/me", {
      headers: { cookie: cookie ?? "" },
    });
    expect(meResponse.status).toBe(200);

    const meBody = (await meResponse.json()) as { email: string };
    expect(meBody.email).toBe("teacher@example.com");

    const logoutResponse = await request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: cookie ?? "" },
    });

    expect(logoutResponse.status).toBe(200);

    const meAfterLogoutResponse = await request("/api/auth/me", {
      headers: { cookie: cookie ?? "" },
    });
    expect(meAfterLogoutResponse.status).toBe(401);
  });

  it("supports session CRUD and chat persistence", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const createSessionResponse = await request("/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ provider: "openai", model: "mock-openai" }),
    });

    expect(createSessionResponse.status).toBe(201);
    const createdSession = (await createSessionResponse.json()) as {
      id: string;
    };

    const chatResponse = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        provider: "openai",
        model: "mock-openai",
        sessionId: createdSession.id,
        messages: [{ role: "user", content: "Plan a lesson" }],
      }),
    });

    expect(chatResponse.status).toBe(200);

    const getSessionResponse = await request(
      `/api/sessions/${createdSession.id}`,
      {
        headers: { cookie },
      },
    );
    expect(getSessionResponse.status).toBe(200);

    const sessionBody = (await getSessionResponse.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(sessionBody.messages.length >= 2).toBe(true);
    expect(sessionBody.messages.at(-1)?.role).toBe("assistant");

    const listResponse = await request("/api/sessions", {
      headers: { cookie },
    });
    expect(listResponse.status).toBe(200);

    const deleteResponse = await request(`/api/sessions/${createdSession.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleteResponse.status).toBe(204);
  });

  it("creates a session automatically when chat is sent without sessionId", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const chatResponse = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        provider: "openai",
        model: "mock-openai",
        messages: [{ role: "user", content: "Create a lesson on loops" }],
      }),
    });
    expect(chatResponse.status).toBe(200);

    const chatBody = (await chatResponse.json()) as { sessionId: string };
    expect(Boolean(chatBody.sessionId)).toBe(true);

    const getSessionResponse = await request(
      `/api/sessions/${chatBody.sessionId}`,
      {
        headers: { cookie },
      },
    );
    expect(getSessionResponse.status).toBe(200);

    const session = (await getSessionResponse.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(session.messages.at(-1)?.role).toBe("assistant");
  });

  it("prevents cross-user session access", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });
    const teacherOneCookie = loginResponse.headers.get("set-cookie") ?? "";

    const createSessionResponse = await request("/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: teacherOneCookie,
      },
      body: JSON.stringify({ provider: "openai", model: "mock-openai" }),
    });
    const teacherOneSession = (await createSessionResponse.json()) as {
      id: string;
    };

    const secondTeacherId = randomUUID();
    upsertTeacher({
      id: secondTeacherId,
      email: "teacher2@example.com",
      name: "Teacher Two",
      passwordHash: await bcrypt.hash("password123", 10),
    });
    const secondTeacherToken = createAuthToken(secondTeacherId);
    const teacherTwoCookie = `teacher_assist_auth=${secondTeacherToken}`;

    const crossGetResponse = await request(
      `/api/sessions/${teacherOneSession.id}`,
      {
        headers: { cookie: teacherTwoCookie },
      },
    );
    expect(crossGetResponse.status).toBe(404);

    const crossPutResponse = await request(
      `/api/sessions/${teacherOneSession.id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: teacherTwoCookie,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Should not be allowed" }],
        }),
      },
    );
    expect(crossPutResponse.status).toBe(404);

    const crossDeleteResponse = await request(
      `/api/sessions/${teacherOneSession.id}`,
      {
        method: "DELETE",
        headers: { cookie: teacherTwoCookie },
      },
    );
    expect(crossDeleteResponse.status).toBe(404);
  });

  it("returns 400 for real model when API key is missing", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";

    const chatResponse = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "user", content: "Plan a lesson" }],
      }),
    });

    expect(chatResponse.status).toBe(400);

    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("streams chat deltas and done event for stream mode", async () => {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "teacher@example.com",
        password: "password123",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const streamResponse = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        provider: "openai",
        model: "mock-openai",
        stream: true,
        messages: [{ role: "user", content: "Stream me" }],
      }),
    });

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    const payload = await streamResponse.text();
    expect(payload.includes("event: delta")).toBe(true);
    expect(payload.includes("event: done")).toBe(true);
  });
});
