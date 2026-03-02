import { beforeEach, describe, expect, it } from "bun:test";

import {
  appendCategorizedMemoryEntry,
  loadMemoryContext,
  readMemoryFile,
  searchSessions,
  upsertMemoryFile,
} from "../src/memory";
import {
  appendSessionMessages,
  createSession,
  resetStores,
  upsertTeacher,
} from "../src/store";

const teacherA = {
  id: "30000000-0000-4000-8000-000000000001",
  email: "memory-a@example.com",
  name: "Memory A",
  passwordHash: "hash",
};

const teacherB = {
  id: "30000000-0000-4000-8000-000000000002",
  email: "memory-b@example.com",
  name: "Memory B",
  passwordHash: "hash",
};

describe("memory", () => {
  beforeEach(async () => {
    await resetStores();
    await upsertTeacher(teacherA);
    await upsertTeacher(teacherB);
  });

  it("isolates memory files by teacher", async () => {
    await upsertMemoryFile({
      teacherId: teacherA.id,
      virtualPath: "MEMORY.md",
      content: "Teacher A memory",
    });

    const mine = await readMemoryFile(teacherA.id, "MEMORY.md");
    expect(mine).toBe("Teacher A memory");

    await expect(readMemoryFile(teacherB.id, "MEMORY.md")).rejects.toThrow(
      "Memory file not found",
    );
  });

  it("truncates loaded memory context to 200 lines", async () => {
    const longContent = Array.from(
      { length: 250 },
      (_, index) => `Line ${index + 1}`,
    ).join("\n");

    await upsertMemoryFile({
      teacherId: teacherA.id,
      virtualPath: "MEMORY.md",
      content: longContent,
    });

    const loaded = await loadMemoryContext({
      teacherId: teacherA.id,
      classRef: null,
    });

    expect((loaded.teacherMemory ?? "").split("\n").length).toBe(200);
  });

  it("searches sessions by keyword and class filter", async () => {
    const alpha = await createSession({
      teacherId: teacherA.id,
      provider: "openai",
      model: "mock-openai",
      classRef: "3B",
      messages: [{ role: "user", content: "Fractions and ratio lesson" }],
    });

    const beta = await createSession({
      teacherId: teacherA.id,
      provider: "openai",
      model: "mock-openai",
      classRef: "2C",
      messages: [{ role: "user", content: "Poetry annotation" }],
    });

    await appendSessionMessages(
      alpha.id,
      teacherA.id,
      [{ role: "assistant", content: "Use retrieval warmup for fractions." }],
      "openai",
      "mock-openai",
      { classRef: "3B" },
    );

    await appendSessionMessages(
      beta.id,
      teacherA.id,
      [{ role: "assistant", content: "Model annotation first." }],
      "openai",
      "mock-openai",
      { classRef: "2C" },
    );

    const hits = await searchSessions({
      teacherId: teacherA.id,
      query: "fractions",
      classId: "3B",
    });

    expect(hits.length).toBe(1);
    expect(hits[0]?.sessionId).toBe(alpha.id);
  });

  it("appends categorized memory into section headings", async () => {
    const inserted = await appendCategorizedMemoryEntry({
      teacherId: teacherA.id,
      scope: "teacher",
      category: "pedagogical",
      text: "Prefers worked examples before independent practice.",
    });

    expect(inserted.inserted).toBe(true);
    const content = await readMemoryFile(teacherA.id, "MEMORY.md");
    expect(content.includes("## Pedagogical Preferences")).toBe(true);
    expect(
      content.includes(
        "- Prefers worked examples before independent practice.",
      ),
    ).toBe(true);
  });
});
