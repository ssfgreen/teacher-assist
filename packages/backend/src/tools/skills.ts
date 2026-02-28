import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { SkillSummary } from "../types";

interface SkillIndexItem extends SkillSummary {
  directory: string;
}

const SKILLS_ROOT = resolve(
  process.cwd(),
  "../../plugins/lesson-planning/skills",
);

let cachedSkills: SkillIndexItem[] | null = null;

function parseDescription(markdown: string): string {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return "No description provided.";
  }

  const descriptionMatch = frontmatterMatch[1]?.match(/^description:\s*(.+)$/m);
  return descriptionMatch?.[1]?.trim() || "No description provided.";
}

function parseName(markdown: string): string | null {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const nameMatch = frontmatterMatch[1]?.match(/^name:\s*(.+)$/m);
  return nameMatch?.[1]?.trim() || null;
}

function loadSkillsIndex(): SkillIndexItem[] {
  if (!existsSync(SKILLS_ROOT)) {
    return [];
  }

  const directories = readdirSync(SKILLS_ROOT);
  const entries: SkillIndexItem[] = [];

  for (const directory of directories) {
    const fullDirectory = resolve(SKILLS_ROOT, directory);
    if (!statSync(fullDirectory).isDirectory()) {
      continue;
    }

    const skillPath = resolve(fullDirectory, "SKILL.md");
    if (!existsSync(skillPath)) {
      continue;
    }

    const content = readFileSync(skillPath, "utf8");
    entries.push({
      name: parseName(content) || directory,
      description: parseDescription(content),
      directory: fullDirectory,
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function ensureSkills(): SkillIndexItem[] {
  if (!cachedSkills) {
    cachedSkills = loadSkillsIndex();
  }
  return cachedSkills;
}

function assertSafeRelativePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..")) {
    throw new Error("Invalid skill path");
  }
  return trimmed;
}

export function refreshSkillsIndexForTests(): void {
  cachedSkills = loadSkillsIndex();
}

export function listSkillsManifest(): SkillSummary[] {
  return ensureSkills().map((skill) => ({
    name: skill.name,
    description: skill.description,
  }));
}

export function buildSkillManifestText(): string {
  const skills = listSkillsManifest();
  if (skills.length === 0) {
    return "No skills available.";
  }

  return skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");
}

export function readSkillByTarget(target: string): {
  skillName: string;
  tier: 2 | 3;
  path: string;
  content: string;
} {
  const safeTarget = assertSafeRelativePath(target);
  const [skillName, ...rest] = safeTarget.split("/");

  const skill = ensureSkills().find((entry) => entry.name === skillName);
  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const relative = rest.length === 0 ? "SKILL.md" : rest.join("/");
  const filePath = resolve(skill.directory, relative);

  if (!filePath.startsWith(skill.directory)) {
    throw new Error("Invalid skill path");
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Skill file not found: ${safeTarget}`);
  }

  return {
    skillName,
    tier: relative === "SKILL.md" ? 2 : 3,
    path: relative === "SKILL.md" ? skillName : `${skillName}/${relative}`,
    content: readFileSync(filePath, "utf8"),
  };
}
