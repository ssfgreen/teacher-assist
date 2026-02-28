import type { SkillFileResponse, SkillManifestItem } from "../types";
import { apiFetch } from "./client";

export async function listSkills(): Promise<{ skills: SkillManifestItem[] }> {
  return apiFetch<{ skills: SkillManifestItem[] }>("/api/skills");
}

export async function readSkill(skillName: string): Promise<SkillFileResponse> {
  return apiFetch<SkillFileResponse>(
    `/api/skills/${encodeURIComponent(skillName)}`,
  );
}
