import { ChevronDown, Loader2, Workflow } from "lucide-react";

import type { ChatMessage } from "../../types";

interface DelegationStep {
  tool: string;
  status: string;
  output: string;
}

interface DelegationDetails {
  agent: string;
  task: string;
  summary: string;
  steps: DelegationStep[];
  status: string;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readSteps(value: unknown): DelegationStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const item = readObject(entry);
      if (!item) {
        return null;
      }
      return {
        tool: readString(item.tool, "tool"),
        status: readString(item.status, "unknown"),
        output: readString(item.output, ""),
      };
    })
    .filter((item): item is DelegationStep => Boolean(item));
}

function parseDelegationDetails(message: ChatMessage): DelegationDetails {
  const metadata = readObject(message.toolMetadata);
  let payload = readObject(message.toolMetadata);

  const parsedContent = (() => {
    try {
      return JSON.parse(message.content);
    } catch {
      return null;
    }
  })();
  const contentObject = readObject(parsedContent);
  if (contentObject) {
    payload = contentObject;
  }

  return {
    agent: readString(payload?.agent ?? metadata?.agent, "subagent"),
    task: readString(payload?.task ?? metadata?.task, "Task not provided."),
    summary: readString(
      payload?.summary ?? metadata?.summary ?? message.content,
      "No summary provided.",
    ),
    steps: readSteps(payload?.steps ?? metadata?.steps),
    status: readString(payload?.status ?? metadata?.status, "unknown"),
  };
}

export function SubagentDelegationCard({
  message,
  pending,
}: {
  message: ChatMessage;
  pending: boolean;
}) {
  const delegation = parseDelegationDetails(message);
  const hasSteps = delegation.steps.length > 0;

  return (
    <details className="mr-auto max-w-[90%] rounded-xl border border-paper-300 bg-surface-panel px-3 py-2 text-xs text-ink-800">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <Workflow className="h-3.5 w-3.5 text-accent-700" />
        <span className="truncate font-medium">
          Delegated to {delegation.agent}
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-ink-700">
          {delegation.status}
        </span>
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin text-ink-700/70" />
        ) : (
          <ChevronDown className="h-3 w-3 text-ink-700/70" />
        )}
      </summary>
      <div className="mt-2 space-y-2 border-l border-paper-300 pl-2">
        <details>
          <summary className="cursor-pointer font-semibold">Task</summary>
          <p className="mt-1 whitespace-pre-wrap">{delegation.task}</p>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">
            Result summary
          </summary>
          <p className="mt-1 whitespace-pre-wrap">{delegation.summary}</p>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">
            Steps ({delegation.steps.length})
          </summary>
          {hasSteps ? (
            <ul className="mt-1 space-y-1">
              {delegation.steps.map((step, index) => (
                <li
                  key={`${step.tool}-${index}`}
                  className="rounded border border-paper-300 bg-surface-muted px-2 py-1"
                >
                  <p className="font-medium">
                    {step.tool} · {step.status}
                  </p>
                  {step.output ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-ink-700">
                      {step.output}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-ink-700">No intermediate tool steps.</p>
          )}
        </details>
      </div>
    </details>
  );
}
