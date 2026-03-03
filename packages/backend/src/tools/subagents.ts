import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface SubagentDefinition {
  name: string;
  description: string;
  instructions: string;
  model?: string;
}

function resolveAgentsRoot(): string {
  const candidates = [
    resolve(process.cwd(), "agents"),
    resolve(process.cwd(), "../../agents"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const AGENTS_ROOT = resolveAgentsRoot();

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) {
      continue;
    }
    fields[key.trim()] = rest.join(":").trim();
  }
  return fields;
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) {
    return markdown.trim();
  }
  return markdown.slice(match[0].length).trim();
}

function safeAgentName(name: string): string {
  const trimmed = name.trim().replace(/\.md$/i, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/")) {
    throw new Error("Invalid agent name");
  }
  return trimmed;
}

export function listAvailableSubagents(): string[] {
  if (!existsSync(AGENTS_ROOT)) {
    return [];
  }

  const entries = readdirSync(AGENTS_ROOT);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith(".md"))
    .map((entry) => entry.replace(/\.md$/i, ""))
    .sort((a, b) => a.localeCompare(b));
}

export function readSubagentDefinition(agent: string): SubagentDefinition {
  const name = safeAgentName(agent);
  const filePath = resolve(AGENTS_ROOT, `${name}.md`);
  if (!filePath.startsWith(AGENTS_ROOT)) {
    throw new Error("Invalid agent path");
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Subagent not found: ${name}`);
  }

  const markdown = readFileSync(filePath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  const instructions = stripFrontmatter(markdown);
  if (!instructions) {
    throw new Error(`Subagent instructions are empty: ${name}`);
  }

  return {
    name: frontmatter.name?.trim() || name,
    description: frontmatter.description?.trim() || "No description provided.",
    instructions,
    model: frontmatter.model?.trim() || undefined,
  };
}
