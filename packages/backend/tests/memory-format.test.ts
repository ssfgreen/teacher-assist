import { describe, expect, it } from "bun:test";

import {
  categoryEntries,
  isNovelEntry,
  upsertCategoryEntry,
} from "../src/memory-format";

describe("memory format", () => {
  it("inserts category headings and a bullet for empty memory", () => {
    const updated = upsertCategoryEntry(
      "",
      "pedagogical",
      "Prefers retrieval starters at the beginning of lessons.",
    );

    expect(updated.inserted).toBe(true);
    expect(updated.content.includes("## Personal Preferences")).toBe(true);
    expect(updated.content.includes("## Pedagogical Preferences")).toBe(true);
    expect(
      updated.content.includes(
        "- Prefers retrieval starters at the beginning of lessons.",
      ),
    ).toBe(true);
  });

  it("treats duplicate statements as non-novel", () => {
    const base = `## Pedagogical Preferences

- Prefers retrieval starters at the beginning of lessons.
`;

    expect(
      isNovelEntry(
        base,
        "pedagogical",
        "Prefers retrieval starters at the beginning of lessons.",
      ),
    ).toBe(false);
  });

  it("falls back to unscoped bullet entries for novelty checks", () => {
    const legacy = "- Keep instructions concise and direct.";
    const entries = categoryEntries(legacy, "personal");
    expect(entries).toEqual(["Keep instructions concise and direct."]);
  });
});
