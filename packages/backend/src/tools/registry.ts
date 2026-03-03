import { readMemoryFile, searchSessions, upsertMemoryFile } from "../memory";
import { readSession, updateSessionTasks } from "../store";
import type { ModelToolDefinition, SessionTask, ToolCall } from "../types";
import {
  listWorkspaceTree,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../workspace";
import { readSkillByTarget } from "./skills";

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface ToolContext {
  teacherId: string;
  sessionId?: string;
}

interface ToolDefinition extends ModelToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  handler: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<string>;
}

async function listDirectory(
  teacherId: string,
  directory: string,
): Promise<string[]> {
  const normalizedPrefix = directory
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const tree = await listWorkspaceTree(teacherId);
  const queue = [...tree];
  const paths: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }

    if (
      !normalizedPrefix ||
      node.path === normalizedPrefix ||
      node.path.startsWith(`${normalizedPrefix}/`)
    ) {
      paths.push(`${node.type === "directory" ? "dir" : "file"}: ${node.path}`);
    }

    if (node.children) {
      queue.push(...node.children);
    }
  }

  return paths.sort((a, b) => a.localeCompare(b));
}

function updateTasksFromArgs(
  tasks: SessionTask[],
  args: Record<string, unknown>,
): SessionTask[] {
  const operation = String(args.operation || "");

  if (operation === "add") {
    const text = String(args.text || "").trim();
    if (!text) {
      throw new Error("update_tasks add requires text");
    }

    const task: SessionTask = {
      id: `task-${tasks.length + 1}`,
      text,
      completed: false,
    };
    return [...tasks, task];
  }

  const id = String(args.id || "").trim();
  if (!id) {
    throw new Error("update_tasks requires id for update/complete");
  }

  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) {
    throw new Error(`Task not found: ${id}`);
  }

  if (operation === "complete") {
    return tasks.map((task) =>
      task.id === id ? { ...task, completed: true } : task,
    );
  }

  if (operation === "update") {
    const text = String(args.text || "").trim();
    if (!text) {
      throw new Error("update_tasks update requires text");
    }

    return tasks.map((task) => (task.id === id ? { ...task, text } : task));
  }

  throw new Error("update_tasks operation must be add, update, or complete");
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a workspace file and return raw content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      if (!path) {
        throw new Error("path is required");
      }
      return readWorkspaceFile(context.teacherId, path);
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a workspace file with supplied content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      const content = String(args.content || "");
      if (!path) {
        throw new Error("path is required");
      }
      await writeWorkspaceFile(context.teacherId, path, content);
      return `Wrote ${path}`;
    },
  },
  {
    name: "str_replace",
    description:
      "Replace an exact string in a workspace file. Fails if zero or multiple matches.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old: { type: "string" },
        new: { type: "string" },
      },
      required: ["path", "old", "new"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      const oldValue = String(args.old || "");
      const newValue = String(args.new || "");
      if (!path) {
        throw new Error("path is required");
      }

      const content = await readWorkspaceFile(context.teacherId, path);
      const occurrences = content.split(oldValue).length - 1;
      if (occurrences === 0) {
        throw new Error("Text to replace not found");
      }
      if (occurrences > 1) {
        throw new Error("Text to replace is ambiguous; appears multiple times");
      }

      await writeWorkspaceFile(
        context.teacherId,
        path,
        content.replace(oldValue, newValue),
      );
      return `Updated ${path}`;
    },
  },
  {
    name: "list_directory",
    description: "List files and directories under a workspace path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      const paths = await listDirectory(context.teacherId, path);
      return paths.join("\n") || "No files found.";
    },
  },
  {
    name: "read_skill",
    description:
      "Read a skill file. Use 'skill-name' for SKILL.md (tier 2) or 'skill-name/file.md' (tier 3).",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string" },
      },
      required: ["target"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const target = String(args.target || "").trim();
      if (!target) {
        throw new Error("target is required");
      }
      const loaded = readSkillByTarget(target);
      return `Skill: ${loaded.path}\nTier: ${loaded.tier}\n\n${loaded.content}`;
    },
  },
  {
    name: "read_memory",
    description: "Read a memory file by virtual path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      if (!path) {
        throw new Error("path is required");
      }
      return readMemoryFile(context.teacherId, path, {
        sessionId: context.sessionId,
      });
    },
  },
  {
    name: "update_memory",
    description:
      "Update a memory file by virtual path. Mode: replace or append.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        mode: { type: "string", enum: ["replace", "append"] },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const path = String(args.path || "").trim();
      const content = String(args.content || "");
      const mode = String(args.mode || "replace");
      if (!path) {
        throw new Error("path is required");
      }
      if (mode !== "replace" && mode !== "append") {
        throw new Error("mode must be replace or append");
      }
      const updated = await upsertMemoryFile({
        teacherId: context.teacherId,
        virtualPath: path,
        content,
        mode,
        sessionId: context.sessionId,
      });
      return `Updated ${updated.path}`;
    },
  },
  {
    name: "search_sessions",
    description:
      "Search prior sessions by keyword and optional filters (classId/dateFrom/dateTo).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        classId: { type: "string" },
        dateFrom: { type: "string" },
        dateTo: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const query = String(args.query || "").trim();
      if (!query) {
        throw new Error("query is required");
      }
      const rows = await searchSessions({
        teacherId: context.teacherId,
        query,
        classId: typeof args.classId === "string" ? args.classId : undefined,
        dateFrom: typeof args.dateFrom === "string" ? args.dateFrom : undefined,
        dateTo: typeof args.dateTo === "string" ? args.dateTo : undefined,
      });
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    name: "read_session",
    description: "Read a past session by sessionId.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const sessionId = String(args.sessionId || "").trim();
      if (!sessionId) {
        throw new Error("sessionId is required");
      }
      const session = await readSession(sessionId);
      if (!session || session.teacherId !== context.teacherId) {
        throw new Error("Session not found");
      }
      return JSON.stringify(
        {
          id: session.id,
          classRef: session.classRef ?? null,
          updatedAt: session.updatedAt,
          messages: session.messages,
        },
        null,
        2,
      );
    },
  },
  {
    name: "ask_user_question",
    description:
      "Ask the teacher a clarifying question and wait for an explicit response before continuing.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: { type: "string" },
        },
        allow_free_text: { type: "boolean" },
      },
      required: ["question", "allow_free_text"],
      additionalProperties: false,
    },
    handler: async () => {
      throw new Error(
        "ask_user_question is handled by the agent loop and should not execute directly",
      );
    },
  },
  {
    name: "update_tasks",
    description:
      "Manage a session task list. Operations: add(text), update(id,text), complete(id).",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "update", "complete"] },
        id: { type: "string" },
        text: { type: "string" },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      if (!context.sessionId) {
        throw new Error("update_tasks requires sessionId");
      }

      const session = await readSession(context.sessionId);
      if (!session || session.teacherId !== context.teacherId) {
        throw new Error("Session not found");
      }

      const nextTasks = updateTasksFromArgs(session.tasks, args);
      await updateSessionTasks(context.sessionId, context.teacherId, nextTasks);
      return JSON.stringify(nextTasks, null, 2);
    },
  },
];

export function listToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export async function dispatchToolCall(
  toolCall: ToolCall,
  context: ToolContext,
): Promise<{ name: string; output: string; isError: boolean }> {
  const tool = TOOL_DEFINITIONS.find((entry) => entry.name === toolCall.name);
  if (!tool) {
    return {
      name: toolCall.name,
      output: `Tool not found: ${toolCall.name}`,
      isError: true,
    };
  }

  try {
    const output = await tool.handler(toolCall.input, context);
    return {
      name: tool.name,
      output,
      isError: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tool execution failed";
    return {
      name: tool.name,
      output: message,
      isError: true,
    };
  }
}

export function toOpenAIToolDefinitions(): Array<Record<string, unknown>> {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toAnthropicToolDefinitions(): Array<Record<string, unknown>> {
  return TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}
