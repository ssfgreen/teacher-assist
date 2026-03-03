import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { SkillSummary } from "../types";

interface SkillIndexItem extends SkillSummary {
  directory: string;
}

function collectTier3Files(
  baseDirectory: string,
  currentDirectory = baseDirectory,
): string[] {
  const entries = readdirSync(currentDirectory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(currentDirectory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTier3Files(baseDirectory, fullPath));
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const relative = fullPath.slice(baseDirectory.length + 1);
    if (relative.toLowerCase() === "skill.md") {
      continue;
    }
    files.push(relative);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function resolveSkillsRoot(): string {
  const candidates = [
    resolve(process.cwd(), "skills"),
    resolve(process.cwd(), "../../skills"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const SKILLS_ROOT = resolveSkillsRoot();

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
    const tier3Files = collectTier3Files(fullDirectory);
    const tier3FileCount = tier3Files.length;
    const issues: string[] = [];
    if (!parseName(content)) {
      issues.push("Missing frontmatter name");
    }
    if (parseDescription(content) === "No description provided.") {
      issues.push("Missing frontmatter description");
    }
    if (!content.includes("##")) {
      issues.push("Missing section headings");
    }
    entries.push({
      name: parseName(content) || directory,
      description: parseDescription(content),
      maxTier: tier3FileCount > 0 ? 3 : 2,
      tier3FileCount,
      tier3Files,
      validation: {
        valid: issues.length === 0,
        issues,
      },
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
    maxTier: skill.maxTier,
    tier3FileCount: skill.tier3FileCount,
    tier3Files: skill.tier3Files,
    validation: skill.validation,
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
