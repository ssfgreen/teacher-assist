import { describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { ChatMessage } from "../src/types";
import {
  deleteWorkspaceFile,
  extractClassRefFromMessages,
  getWorkspaceRootForTests,
  loadWorkspaceContext,
  readWorkspaceFile,
  resetTeacherWorkspaceForTests,
  seedWorkspaceForTeacher,
  writeWorkspaceFile,
} from "../src/workspace";

const teacherId = "workspace-teacher";

function cleanup(): void {
  resetTeacherWorkspaceForTests(teacherId);
}

describe("workspace storage", () => {
  it("seeds expected workspace defaults", async () => {
    cleanup();

    await seedWorkspaceForTeacher(teacherId);

    const root = join(getWorkspaceRootForTests(), teacherId);
    expect(existsSync(join(root, "soul.md"))).toBe(true);
    expect(existsSync(join(root, "teacher.md"))).toBe(true);
    expect(existsSync(join(root, "pedagogy.md"))).toBe(true);
    expect(existsSync(join(root, "classes"))).toBe(true);
    expect(existsSync(join(root, "curriculum"))).toBe(true);

    cleanup();
  });

  it("supports file CRUD and protects soul.md deletion", async () => {
    cleanup();

    await seedWorkspaceForTeacher(teacherId);
    await writeWorkspaceFile(teacherId, "classes/3B/PROFILE.md", "# Class 3B");
    expect(
      await readWorkspaceFile(teacherId, "classes/3B/PROFILE.md"),
    ).toContain("Class 3B");

    await deleteWorkspaceFile(teacherId, "classes/3B/PROFILE.md");
    await expect(
      readWorkspaceFile(teacherId, "classes/3B/PROFILE.md"),
    ).rejects.toThrow();

    await expect(deleteWorkspaceFile(teacherId, "soul.md")).rejects.toThrow(
      "Cannot delete soul.md",
    );

    cleanup();
  });

  it("loads soul fallback when soul.md is missing", async () => {
    cleanup();

    await seedWorkspaceForTeacher(teacherId);

    const soulPath = join(getWorkspaceRootForTests(), teacherId, "soul.md");
    rmSync(soulPath, { force: true });

    const context = await loadWorkspaceContext({
      teacherId,
      messages: [{ role: "user", content: "Plan for 3B" }],
      classRef: "3B",
    });

    expect(context.assistantIdentity).toContain("Assistant Identity");

    cleanup();
  });

  it("loads class and curriculum context for class chats", async () => {
    cleanup();

    await seedWorkspaceForTeacher(teacherId);
    await writeWorkspaceFile(
      teacherId,
      "classes/3B/PROFILE.md",
      "# Class 3B\nSubject: Computing Science",
    );
    await writeWorkspaceFile(
      teacherId,
      "curriculum/computing-science.md",
      "# Computing outcomes",
    );

    const context = await loadWorkspaceContext({
      teacherId,
      messages: [{ role: "user", content: "Create a loops lesson for 3B" }],
    });

    expect(context.loadedPaths.includes("soul.md")).toBe(true);
    expect(context.loadedPaths.includes("classes/3B/PROFILE.md")).toBe(true);
    expect(
      context.loadedPaths.includes("curriculum/computing-science.md"),
    ).toBe(true);

    cleanup();
  });
});

describe("class reference extraction", () => {
  it("extracts class reference from latest user message", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "Create a lesson for 3B" },
    ];

    expect(extractClassRefFromMessages(messages)).toBe("3B");
  });
});
