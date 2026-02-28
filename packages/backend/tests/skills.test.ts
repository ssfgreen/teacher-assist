import { describe, expect, it } from "bun:test";

import {
  listSkillsManifest,
  readSkillByTarget,
  refreshSkillsIndexForTests,
} from "../src/tools/skills";

describe("skills infrastructure", () => {
  it("builds manifest from skills directory", () => {
    refreshSkillsIndexForTests();
    const skills = listSkillsManifest();

    expect(skills.length >= 3).toBe(true);
    expect(skills.some((skill) => skill.name === "backward-design")).toBe(true);
    expect(
      skills.some((skill) =>
        skill.description.toLowerCase().includes("lesson"),
      ),
    ).toBe(true);
  });

  it("reads tier 2 and tier 3 skill content", () => {
    const tier2 = readSkillByTarget("backward-design");
    expect(tier2.tier).toBe(2);
    expect(tier2.content.includes("Backward Design")).toBe(true);

    const tier3 = readSkillByTarget("backward-design/examples.md");
    expect(tier3.tier).toBe(3);
    expect(tier3.content.includes("Backward Design Example")).toBe(true);
  });

  it("throws for unknown skill", () => {
    expect(() => readSkillByTarget("does-not-exist")).toThrow();
  });
});
