import { describe, expect, it } from "bun:test";

import type { ChatMessage } from "../src/types";
import {
  deleteWorkspaceFile,
  extractClassRefFromMessages,
  loadWorkspaceContext,
  readWorkspaceFile,
  resetTeacherWorkspaceForTests,
  seedWorkspaceForTeacher,
  writeWorkspaceFile,
} from "../src/workspace";

const teacherId = "workspace-teacher";

async function cleanup(): Promise<void> {
  await resetTeacherWorkspaceForTests(teacherId);
}

describe("workspace storage", () => {
  it("seeds expected workspace defaults", async () => {
    await cleanup();

    await seedWorkspaceForTeacher(teacherId);

    await expect(readWorkspaceFile(teacherId, "soul.md")).resolves.toContain(
      "Assistant Identity",
    );
    await expect(readWorkspaceFile(teacherId, "teacher.md")).resolves.toContain(
      "Teacher Profile",
    );
    await expect(
      readWorkspaceFile(teacherId, "pedagogy.md"),
    ).resolves.toContain("Pedagogy Preferences");
    await expect(
      readWorkspaceFile(teacherId, "classes/README.md"),
    ).resolves.toContain("Class Profile");
    await expect(
      readWorkspaceFile(teacherId, "curriculum/README.md"),
    ).resolves.toContain("Curriculum Notes");

    await cleanup();
  });

  it("supports file CRUD and protects soul.md deletion", async () => {
    await cleanup();

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

    await cleanup();
  });

  it("loads soul fallback when soul.md is missing", async () => {
    await cleanup();

    await seedWorkspaceForTeacher(teacherId);

    const context = await loadWorkspaceContext({
      teacherId,
      messages: [{ role: "user", content: "Plan for 3B" }],
      classRef: "3B",
    });

    expect(context.assistantIdentity).toContain("Assistant Identity");

    await cleanup();
  });

  it("loads class and curriculum context for class chats", async () => {
    await cleanup();

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

    await cleanup();
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
