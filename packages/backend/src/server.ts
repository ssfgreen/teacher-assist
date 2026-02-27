import {
  authenticateFromRequest,
  buildAuthClearCookie,
  buildAuthSetCookie,
  login,
  logoutFromRequest,
  seedDefaultTeacher,
} from "./auth";
import {
  assertValidProvider,
  callModel,
  ModelConfigurationError,
} from "./model";
import {
  appendSessionMessages,
  checkRateLimit,
  createSession,
  deleteSession,
  listSessions,
  readSession,
} from "./store";
import type { ChatMessage, Provider } from "./types";

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

async function parseJson<T>(request: Request): Promise<T> {
  const body = await request.json();
  return body as T;
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

export async function createHandler(request: Request): Promise<Response> {
  await seedDefaultTeacher();

  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await parseJson<{ email: string; password: string }>(request);
    const result = await login(body.email, body.password);
    if (!result) {
      return json({ error: "Invalid credentials" }, 401);
    }

    return json(
      {
        teacher: result.teacher,
      },
      200,
      {
        "set-cookie": buildAuthSetCookie(result.token),
      },
    );
  }

  if (pathname.startsWith("/api/") && pathname !== "/api/auth/login") {
    const teacher = authenticateFromRequest(request);
    if (!teacher) {
      return unauthorized();
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      logoutFromRequest(request);
      return json({ ok: true }, 200, {
        "set-cookie": buildAuthClearCookie(),
      });
    }

    if (pathname === "/api/auth/me" && request.method === "GET") {
      return json(teacher);
    }

    if (pathname === "/api/chat" && request.method === "POST") {
      const limited = checkRateLimit(teacher.id);
      if (limited.limited) {
        return json({ error: "Rate limited" }, 429, {
          "retry-after": String(limited.retryAfterSec ?? 60),
        });
      }

      const body = await parseJson<{
        messages: ChatMessage[];
        provider: string;
        model: string;
        sessionId?: string;
      }>(request);

      assertValidProvider(body.provider);
      const provider = body.provider as Provider;

      let response;
      try {
        response = await callModel(provider, body.model, body.messages);
      } catch (error) {
        if (error instanceof ModelConfigurationError) {
          return json({ error: error.message }, 400);
        }
        return json({ error: "Model request failed" }, 502);
      }

      const userAndAssistantMessages: ChatMessage[] = [];
      const lastUserMessage = [...body.messages]
        .reverse()
        .find((msg) => msg.role === "user");
      if (lastUserMessage) {
        userAndAssistantMessages.push(lastUserMessage);
      }
      userAndAssistantMessages.push({
        role: "assistant",
        content: response.content,
      });

      let sessionId = body.sessionId;
      if (sessionId) {
        const updated = appendSessionMessages(
          sessionId,
          teacher.id,
          userAndAssistantMessages,
          provider,
          body.model,
        );
        if (!updated) {
          return json({ error: "Session not found" }, 404);
        }
      } else {
        const created = createSession({
          teacherId: teacher.id,
          provider,
          model: body.model,
          messages: userAndAssistantMessages,
        });
        sessionId = created.id;
      }

      return json({
        response,
        sessionId,
      });
    }

    if (pathname === "/api/sessions" && request.method === "POST") {
      const body = await parseJson<{
        provider: string;
        model: string;
        messages?: ChatMessage[];
      }>(request);

      assertValidProvider(body.provider);
      const created = createSession({
        teacherId: teacher.id,
        provider: body.provider as Provider,
        model: body.model,
        messages: body.messages,
      });

      return json(created, 201);
    }

    if (pathname === "/api/sessions" && request.method === "GET") {
      const sessions = listSessions(teacher.id);
      return json(sessions);
    }

    if (pathname.startsWith("/api/sessions/") && request.method === "GET") {
      const sessionId = pathname.split("/").at(-1) ?? "";
      const session = readSession(sessionId);
      if (!session || session.teacherId !== teacher.id) {
        return json({ error: "Session not found" }, 404);
      }
      return json(session);
    }

    if (pathname.startsWith("/api/sessions/") && request.method === "PUT") {
      const sessionId = pathname.split("/").at(-1) ?? "";
      const body = await parseJson<{
        messages: ChatMessage[];
        provider?: string;
        model?: string;
      }>(request);

      let provider: Provider | undefined;
      if (body.provider) {
        assertValidProvider(body.provider);
        provider = body.provider;
      }

      const updated = appendSessionMessages(
        sessionId,
        teacher.id,
        body.messages,
        provider,
        body.model,
      );
      if (!updated) {
        return json({ error: "Session not found" }, 404);
      }
      return json(updated);
    }

    if (pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const sessionId = pathname.split("/").at(-1) ?? "";
      const deleted = deleteSession(sessionId, teacher.id);
      if (!deleted) {
        return json({ error: "Session not found" }, 404);
      }
      return new Response(null, { status: 204 });
    }

    return json({ error: "Not found" }, 404);
  }

  return json({ error: "Not found" }, 404);
}

export async function startServer(port = 3001): Promise<Server> {
  await seedDefaultTeacher();
  return Bun.serve({
    port,
    fetch: createHandler,
  });
}
