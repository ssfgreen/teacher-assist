import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SessionRecord, Teacher } from "../types";

const DATA_DIR = resolve(process.cwd(), ".data");
const STORE_PATH = resolve(DATA_DIR, "store.json");

interface PersistedStore {
  teachers: Teacher[];
  sessions: SessionRecord[];
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readStoreFromDisk(): PersistedStore {
  ensureDataDir();

  if (!existsSync(STORE_PATH)) {
    return { teachers: [], sessions: [] };
  }

  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedStore;
    return {
      teachers: parsed.teachers ?? [],
      sessions: parsed.sessions ?? [],
    };
  } catch {
    return { teachers: [], sessions: [] };
  }
}

export function writeStoreToDisk(payload: PersistedStore): void {
  ensureDataDir();
  writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2));
}
