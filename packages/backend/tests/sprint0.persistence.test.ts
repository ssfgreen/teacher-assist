import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { resolveDatabaseUrl } from "../src/config";
import { closeDataSource } from "../src/db";
import {
  appendSessionMessages,
  createSession,
  deleteSession,
  deleteTeacher,
  getTeacherByEmail,
  getTeacherById,
  listSessions,
  readSession,
  resetStores,
  upsertTeacher,
} from "../src/store";

describe("sprint 0 persistence and config", () => {
  beforeEach(async () => {
    await resetStores();
  });

  afterEach(async () => {
    await resetStores();
  });

  afterAll(async () => {
    await closeDataSource();
  });

  it("supports teachers table CRUD operations", async () => {
    const teacherId = randomUUID();
    await upsertTeacher({
      id: teacherId,
      email: "crud-teacher@example.com",
      name: "Teacher CRUD",
      passwordHash: "hash-1",
    });

    const byEmail = await getTeacherByEmail("crud-teacher@example.com");
    expect(byEmail?.id).toBe(teacherId);
    expect(byEmail?.name).toBe("Teacher CRUD");

    await upsertTeacher({
      id: teacherId,
      email: "crud-teacher@example.com",
      name: "Teacher CRUD Updated",
      passwordHash: "hash-2",
    });

    const byId = await getTeacherById(teacherId);
    expect(byId?.name).toBe("Teacher CRUD Updated");
    expect(byId?.passwordHash).toBe("hash-2");

    const deleted = await deleteTeacher(teacherId);
    expect(deleted).toBe(true);
    expect(await getTeacherById(teacherId)).toBeNull();
  });

  it("supports sessions table CRUD operations", async () => {
    const teacherId = randomUUID();
    await upsertTeacher({
      id: teacherId,
      email: "session-owner@example.com",
      name: "Session Owner",
      passwordHash: "hash-session",
    });

    const session = await createSession({
      teacherId,
      provider: "openai",
      model: "mock-openai",
      messages: [{ role: "user", content: "hello" }],
    });

    const listed = await listSessions(teacherId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(session.id);

    const updated = await appendSessionMessages(
      session.id,
      teacherId,
      [{ role: "assistant", content: "hi" }],
      "anthropic",
      "mock-anthropic",
    );
    expect(updated?.messages).toHaveLength(2);
    expect(updated?.provider).toBe("anthropic");
    expect(updated?.model).toBe("mock-anthropic");

    const readBack = await readSession(session.id);
    expect(readBack?.messages.at(-1)?.content).toBe("hi");

    const deleted = await deleteSession(session.id, teacherId);
    expect(deleted).toBe(true);
    expect(await readSession(session.id)).toBeNull();
  });

  it("loads database url from environment variables with fallback", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://override/test";
    expect(resolveDatabaseUrl()).toBe("postgres://override/test");

    process.env.DATABASE_URL = undefined;
    expect(resolveDatabaseUrl()).toContain("teacher_assist");

    if (original !== undefined) {
      process.env.DATABASE_URL = original;
    } else {
      process.env.DATABASE_URL = undefined;
    }
  });
});
