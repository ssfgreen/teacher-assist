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
  teacherMemory?: string | null;
  classMemory?: string | null;
  skillManifest?: string;
  toolInstructions?: string;
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
    {
      tag: "teacher-memory",
      content: params.teacherMemory?.trim() || "No teacher memory loaded.",
    },
    {
      tag: "class-memory",
      content: params.classMemory?.trim() || "No class memory loaded.",
    },
    {
      tag: "skill-manifest",
      content: params.skillManifest ?? "No skills available.",
    },
    {
      tag: "tool-instructions",
      content:
        params.toolInstructions ??
        "No tool instructions configured for this environment.",
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
- Final teacher-facing responses must be valid Markdown with clear structure.
- Use Markdown formatting where possible:
  - Headings: \`#\`, \`##\`, \`###\`
  - Bullet lists: \`-\`
  - Emphasis: \`**bold**\` and \`*italic*\`
  - Links: standard markdown links when useful
- Preserve readable line breaks and paragraph spacing; do not return plain text blocks.
- For pedagogy or lesson-design requests, call \`read_skill\` for relevant skills before finalising the response.
- Use tool calls to load additional workspace files only when needed.
- For class-targeted requests, prefer reading \`classes/{classRef}/CLASS.md\` before making class-specific claims.
- Delegate with \`spawn_subagent\` only when a clearly bounded specialist sub-task would improve quality (for example critique, differentiation check, or resource variant generation).
- Do not delegate simple synthesis or short edits that can be done directly in the current turn.
- When a subagent returns, synthesise its summary into one coherent teacher-facing response.
`;
