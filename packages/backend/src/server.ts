import {
  authenticateFromRequest,
  buildAuthClearCookie,
  buildAuthSetCookie,
  login,
  logoutFromRequest,
  seedDefaultTeacher,
} from "./auth";
import {
  ModelConfigurationError,
  assertValidProvider,
  callModel,
  streamModel,
} from "./model";
import { DEFAULT_AGENT_INSTRUCTIONS, assembleSystemPrompt } from "./prompt";
import {
  appendSessionMessages,
  checkRateLimit,
  createSession,
  deleteSession,
  listSessions,
  readSession,
} from "./store";
import type { ChatMessage, ModelResponse, Provider } from "./types";
import {
  type LoadedWorkspaceContext,
  deleteWorkspaceFile,
  listClassRefs,
  listWorkspaceTree,
  loadWorkspaceContext,
  readWorkspaceFile,
  renameWorkspacePath,
  seedWorkspaceForTeacher,
  writeWorkspaceFile,
} from "./workspace";

function isWorkspaceStorageErrorMessage(message: string): boolean {
  return (
    message.includes("Workspace storage requires PostgreSQL") ||
    message.includes("workspace_files table is missing")
  );
}

function workspaceFailureResponse(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : "Workspace storage unavailable";

  if (isWorkspaceStorageErrorMessage(message)) {
    return json({ error: message }, 503);
  }

  return json({ error: message }, 400);
}

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

function parseWorkspacePath(pathname: string): string {
  const prefix = "/api/workspace/";
  if (!pathname.startsWith(prefix)) {
    throw new Error("Invalid workspace path");
  }

  const rawPath = pathname.slice(prefix.length);
  const decoded = decodeURIComponent(rawPath);
  if (!decoded) {
    throw new Error("Invalid workspace path");
  }

  return decoded;
}

function buildAssistantMessages(
  existingMessages: ChatMessage[],
  assistantContent: string,
): ChatMessage[] {
  const userAndAssistantMessages: ChatMessage[] = [];
  const lastUserMessage = [...existingMessages]
    .reverse()
    .find((msg) => msg.role === "user");

  if (lastUserMessage) {
    userAndAssistantMessages.push(lastUserMessage);
  }

  userAndAssistantMessages.push({
    role: "assistant",
    content: assistantContent,
  });

  return userAndAssistantMessages;
}

function persistChatResult(params: {
  teacherId: string;
  sessionId?: string;
  provider: Provider;
  model: string;
  sourceMessages: ChatMessage[];
  assistantContent: string;
}): { sessionId: string } | { error: "Session not found" } {
  const messagesToAppend = buildAssistantMessages(
    params.sourceMessages,
    params.assistantContent,
  );

  let sessionId = params.sessionId;
  if (sessionId) {
    const updated = appendSessionMessages(
      sessionId,
      params.teacherId,
      messagesToAppend,
      params.provider,
      params.model,
    );
    if (!updated) {
      return { error: "Session not found" };
    }
    return { sessionId };
  }

  const created = createSession({
    teacherId: params.teacherId,
    provider: params.provider,
    model: params.model,
    messages: messagesToAppend,
  });
  sessionId = created.id;
  return { sessionId };
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
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
    try {
      await seedWorkspaceForTeacher(result.teacher.id);
    } catch (error) {
      return workspaceFailureResponse(error);
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
      try {
        await seedWorkspaceForTeacher(teacher.id);
      } catch (error) {
        return workspaceFailureResponse(error);
      }
      return json(teacher);
    }

    if (pathname === "/api/workspace" && request.method === "GET") {
      try {
        const tree = await listWorkspaceTree(teacher.id);
        const classRefs = await listClassRefs(teacher.id);
        return json({
          tree,
          classRefs,
        });
      } catch (error) {
        return workspaceFailureResponse(error);
      }
    }

    if (pathname === "/api/workspace/seed" && request.method === "POST") {
      try {
        await seedWorkspaceForTeacher(teacher.id);
      } catch (error) {
        return workspaceFailureResponse(error);
      }
      return json({
        ok: true,
      });
    }

    if (pathname === "/api/workspace/rename" && request.method === "POST") {
      const body = await parseJson<{ fromPath: string; toPath: string }>(
        request,
      );
      try {
        const result = await renameWorkspacePath({
          teacherId: teacher.id,
          fromPath: body.fromPath,
          toPath: body.toPath,
        });
        return json({
          ok: true,
          ...result,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid workspace path";
        if (isWorkspaceStorageErrorMessage(message)) {
          return json({ error: message }, 503);
        }
        const status =
          message === "Workspace path not found"
            ? 404
            : message.includes("already exists")
              ? 409
              : 400;
        return json({ error: message }, status);
      }
    }

    if (pathname.startsWith("/api/workspace/") && request.method === "GET") {
      try {
        const relativePath = parseWorkspacePath(pathname);
        const content = await readWorkspaceFile(teacher.id, relativePath);
        return json({
          path: relativePath,
          content,
        });
      } catch (error) {
        return workspaceFailureResponse(error);
      }
    }

    if (pathname.startsWith("/api/workspace/") && request.method === "PUT") {
      const body = await parseJson<{ content: string }>(request);
      try {
        const relativePath = parseWorkspacePath(pathname);
        await writeWorkspaceFile(teacher.id, relativePath, body.content ?? "");
        return json({
          ok: true,
          path: relativePath,
        });
      } catch (error) {
        return workspaceFailureResponse(error);
      }
    }

    if (pathname.startsWith("/api/workspace/") && request.method === "DELETE") {
      try {
        const relativePath = parseWorkspacePath(pathname);
        await deleteWorkspaceFile(teacher.id, relativePath);
        return new Response(null, { status: 204 });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid workspace path";
        if (isWorkspaceStorageErrorMessage(message)) {
          return json({ error: message }, 503);
        }
        const status = message === "Cannot delete soul.md" ? 400 : 404;
        return json({ error: message }, status);
      }
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
        stream?: boolean;
        maxTokens?: number;
        classRef?: string;
      }>(request);

      assertValidProvider(body.provider);
      const provider = body.provider as Provider;
      let workspaceContext: LoadedWorkspaceContext;
      try {
        workspaceContext = await loadWorkspaceContext({
          teacherId: teacher.id,
          messages: body.messages,
          classRef: body.classRef,
        });
      } catch (error) {
        return workspaceFailureResponse(error);
      }
      const { systemPrompt, estimatedTokens } = assembleSystemPrompt({
        assistantIdentity: workspaceContext.assistantIdentity,
        agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        workspaceContext: workspaceContext.workspaceContextSections,
      });
      const modelMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...body.messages.filter((message) => message.role !== "system"),
      ];
      console.info(
        `[prompt] teacher=${teacher.id} tokens=${estimatedTokens} classRef=${workspaceContext.classRef ?? "none"}`,
      );

      if (body.stream) {
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;
            const closeStream = () => {
              if (closed) {
                return;
              }
              closed = true;
              try {
                controller.close();
              } catch {
                // Ignore close errors when controller is already closed.
              }
            };

            const pushEvent = (event: string, payload: unknown) => {
              if (closed) {
                return;
              }
              try {
                controller.enqueue(encoder.encode(sseEvent(event, payload)));
              } catch {
                closed = true;
              }
            };

            const run = async () => {
              pushEvent("start", { ok: true });

              const heartbeat = setInterval(() => {
                pushEvent("ping", { t: Date.now() });
              }, 5000);

              let response: ModelResponse;
              try {
                response = await streamModel(
                  provider,
                  body.model,
                  modelMessages,
                  (delta) => {
                    pushEvent("delta", { text: delta });
                  },
                  body.maxTokens,
                );
              } catch (error) {
                if (error instanceof ModelConfigurationError) {
                  pushEvent("error", { error: error.message });
                } else {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Model request failed";
                  pushEvent("error", { error: message });
                }
                clearInterval(heartbeat);
                closeStream();
                return;
              }

              const persisted = persistChatResult({
                teacherId: teacher.id,
                sessionId: body.sessionId,
                provider,
                model: body.model,
                sourceMessages: body.messages,
                assistantContent: response.content,
              });

              if ("error" in persisted) {
                pushEvent("error", { error: persisted.error });
                clearInterval(heartbeat);
                closeStream();
                return;
              }

              pushEvent("done", {
                response,
                sessionId: persisted.sessionId,
                workspaceContextLoaded: workspaceContext.loadedPaths,
              });
              clearInterval(heartbeat);
              closeStream();
            };

            void run();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      let response: ModelResponse;
      try {
        response = await callModel(
          provider,
          body.model,
          modelMessages,
          body.maxTokens,
        );
      } catch (error) {
        if (error instanceof ModelConfigurationError) {
          return json({ error: error.message }, 400);
        }
        const message =
          error instanceof Error ? error.message : "Model request failed";
        return json({ error: message }, 502);
      }

      const persisted = persistChatResult({
        teacherId: teacher.id,
        sessionId: body.sessionId,
        provider,
        model: body.model,
        sourceMessages: body.messages,
        assistantContent: response.content,
      });

      if ("error" in persisted) {
        return json({ error: persisted.error }, 404);
      }

      return json({
        response,
        sessionId: persisted.sessionId,
        workspaceContextLoaded: workspaceContext.loadedPaths,
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
    idleTimeout: 120,
    fetch: createHandler,
  });
}
