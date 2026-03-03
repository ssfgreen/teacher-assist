export interface CommandDefinition {
  id: string;
  label: string;
  description: string;
  framing: string;
}

const COMMANDS: CommandDefinition[] = [
  {
    id: "create-lesson",
    label: "Create lesson",
    description:
      "Build a complete lesson draft with outcomes, activities, differentiation, and assessment.",
    framing:
      "You are executing the create-lesson command. Prioritize a complete first draft with clear lesson structure, timing, differentiation, and formative assessment checks.",
  },
  {
    id: "refine-lesson",
    label: "Refine lesson",
    description:
      "Improve an existing lesson draft while preserving intent and fixing clarity, flow, or alignment gaps.",
    framing:
      "You are executing the refine-lesson command. Prioritize targeted improvements over rewrite-from-scratch unless the teacher explicitly asks for a full rewrite.",
  },
  {
    id: "update-class",
    label: "Update class",
    description:
      "Update class profile assumptions and planning implications for a specific class context.",
    framing:
      "You are executing the update-class command. Focus on class-specific context, constraints, and actionable updates to future planning assumptions.",
  },
];

export function listCommandDefinitions(): CommandDefinition[] {
  return COMMANDS;
}

export function getCommandDefinition(
  commandId: string,
): CommandDefinition | undefined {
  return COMMANDS.find((command) => command.id === commandId);
}

export function commandInstructions(commandId?: string): string {
  if (!commandId) {
    return "";
  }
  const command = getCommandDefinition(commandId);
  if (!command) {
    return "";
  }

  return [
    "",
    "Active command:",
    `- id: ${command.id}`,
    `- label: ${command.label}`,
    `- guidance: ${command.framing}`,
  ].join("\n");
}
