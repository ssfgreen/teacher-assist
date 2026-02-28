import type { ChatMessage } from "../../types";

function toolIcon(toolName?: string): string {
  if (toolName === "read_skill") {
    return "SK";
  }
  if (toolName === "read_file" || toolName === "write_file") {
    return "FI";
  }
  if (toolName === "update_tasks") {
    return "TS";
  }
  return "TL";
}

function toolSummary(message: ChatMessage): string {
  if (message.toolName === "read_skill") {
    const target =
      typeof message.toolInput?.target === "string"
        ? message.toolInput.target
        : "skill";
    return `Read skill: ${target}`;
  }

  if (message.toolName === "read_file" || message.toolName === "write_file") {
    const path =
      typeof message.toolInput?.path === "string"
        ? message.toolInput.path
        : "file";
    return `${message.toolName === "read_file" ? "Read file" : "Write file"}: ${path}`;
  }

  if (message.toolName === "update_tasks") {
    return "Updated tasks";
  }

  return `${message.toolName ?? "tool"} executed`;
}

interface ToolCallMessageProps {
  message: ChatMessage;
}

export function ToolCallMessage({ message }: ToolCallMessageProps) {
  return (
    <details className="max-w-[90%] rounded-xl border border-paper-100 bg-paper-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer list-none font-medium">
        <span className="mr-1" aria-hidden="true">
          {toolIcon(message.toolName)}
        </span>
        {toolSummary(message)}
        {message.toolError ? " (error)" : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <p className="text-xs font-medium text-ink-800">Arguments</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-paper-100 bg-white p-2 text-xs">
            {JSON.stringify(message.toolInput ?? {}, null, 2)}
          </pre>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-800">Result</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-paper-100 bg-white p-2 text-xs">
            {message.content}
          </pre>
        </div>
      </div>
    </details>
  );
}
