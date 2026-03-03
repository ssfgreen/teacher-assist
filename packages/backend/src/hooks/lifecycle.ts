import type { ChatMessage, ModelResponse, ToolCall } from "../types";

export type HookPhase =
  | "preLoop"
  | "postLoop"
  | "preModel"
  | "postModel"
  | "preTool"
  | "postTool";

export interface HookContext {
  phase: HookPhase;
  turn?: number;
  messages: ChatMessage[];
  modelResponse?: ModelResponse;
  toolCall?: ToolCall;
  toolResult?: {
    name: string;
    output: string;
    isError: boolean;
    cacheHit?: boolean;
  };
}

export type HookHandler = (context: HookContext) => Promise<void> | void;

export type HookRegistry = Partial<Record<HookPhase, HookHandler[]>>;

export async function runHookPhase(params: {
  hooks?: HookRegistry;
  phase: HookPhase;
  context: Omit<HookContext, "phase">;
}): Promise<void> {
  const handlers = params.hooks?.[params.phase] ?? [];
  if (handlers.length === 0) {
    return;
  }

  for (const handler of handlers) {
    await handler({
      phase: params.phase,
      ...params.context,
    });
  }
}
