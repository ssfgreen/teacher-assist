interface PromptSection {
  tag: string;
  content: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  estimatedTokens: number;
}

function wrapSection(section: PromptSection): string {
  return `<${section.tag}>\n${section.content.trim()}\n</${section.tag}>`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function assembleSystemPrompt(params: {
  assistantIdentity: string;
  agentInstructions: string;
  workspaceContext: Array<{ path: string; content: string }>;
}): AssembledPrompt {
  const workspaceContextBody = params.workspaceContext
    .map((item) => `## ${item.path}\n${item.content.trim()}`)
    .join("\n\n");

  const sections: PromptSection[] = [
    {
      tag: "assistant-identity",
      content: params.assistantIdentity,
    },
    {
      tag: "agent-instructions",
      content: params.agentInstructions,
    },
    {
      tag: "workspace-context",
      content: workspaceContextBody || "No workspace context loaded.",
    },
  ];

  const systemPrompt = sections.map(wrapSection).join("\n\n");

  return {
    systemPrompt,
    estimatedTokens: estimateTokens(systemPrompt),
  };
}

export const DEFAULT_AGENT_INSTRUCTIONS = `
You support teachers to design lesson resources.

Rules:
- Produce draft outputs suitable for teacher review.
- Reference relevant workspace context where possible.
- If context is missing, ask concise clarification questions.
- Keep claims grounded in the provided workspace files.
`;
