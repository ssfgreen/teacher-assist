import { randomUUID } from "node:crypto";

import { type MemoryProposal, readMemoryFile } from "./memory";
import {
  type MemoryCategory,
  categoryEntries,
  memorySimilarity,
} from "./memory-format";
import { callModel } from "./model";
import type { ChatMessage, Provider } from "./types";

const MEMORY_EXTRACTOR_MAX_TOKENS = 350;
const MAX_PROPOSALS = 4;
const MAX_CONTEXT_MESSAGES = 8;

interface MemoryExtractionCandidate {
  category: MemoryCategory;
  scope: "teacher" | "class";
  classId?: string;
  statement: string;
  evidence: string;
  confidence: number;
}

interface ExtractMemoryProposalsParams {
  teacherId: string;
  provider: Provider;
  model: string;
  classRef?: string | null;
  latestUserMessage: string;
  finalAssistantMessage: string;
  recentMessages: ChatMessage[];
}

function truncate(value: string, maxLength: number): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeClassId(value: string): string {
  return value.trim().toUpperCase();
}

function toCategory(value: unknown): MemoryCategory | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "personal") {
    return "personal";
  }
  if (normalized === "pedagogical") {
    return "pedagogical";
  }
  if (normalized === "class" || normalized === "class-based") {
    return "class";
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function scoreValue(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? trimmed;
  const firstBrace = fenced.indexOf("{");
  const lastBrace = fenced.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? fenced.slice(firstBrace, lastBrace + 1)
      : fenced;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatRecentMessages(messages: ChatMessage[]): string {
  const relevant = messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .slice(-MAX_CONTEXT_MESSAGES);

  if (relevant.length === 0) {
    return "(none)";
  }

  return relevant
    .map((message) => {
      const role = message.role.toUpperCase();
      const content = message.content.trim().replace(/\s+/g, " ");
      return `${role}: ${content.slice(0, 260)}`;
    })
    .join("\n");
}

function looksLikeSummary(statement: string): boolean {
  const value = statement.toLowerCase();
  return (
    value.startsWith("teacher request pattern:") ||
    value.startsWith("working strategy:") ||
    value.startsWith("for class")
  );
}

function normalizeCandidate(
  value: unknown,
  classRef?: string | null,
): MemoryExtractionCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;

  const category = toCategory(candidate.category);
  if (!category) {
    return null;
  }

  const statement = textValue(candidate.statement).replace(/\s+/g, " ");
  if (!statement || statement.length < 12 || statement.length > 220) {
    return null;
  }
  if (looksLikeSummary(statement)) {
    return null;
  }

  const scope = category === "class" ? "class" : "teacher";
  let classId: string | undefined;
  if (scope === "class") {
    const raw = textValue(candidate.classId) || textValue(classRef ?? "");
    if (!raw) {
      return null;
    }
    classId = normalizeClassId(raw);
  }

  const evidence = textValue(candidate.evidence);
  return {
    category,
    scope,
    classId,
    statement,
    evidence: evidence || "Derived from this exchange.",
    confidence: scoreValue(candidate.confidence),
  };
}

function heuristicCandidatesFromLatestUserMessage(
  latestUserMessage: string,
  classRef?: string,
): MemoryExtractionCandidate[] {
  const source = latestUserMessage.trim();
  if (!source) {
    return [];
  }

  const candidates: MemoryExtractionCandidate[] = [];
  const durationMatch = source.match(
    /\b(?:all\s+my\s+lessons?|my\s+lessons?)\s+(?:are|run\s+for|last)\s+(\d{2,3})\s*minutes?\b/i,
  );
  if (durationMatch) {
    const minutes = Number.parseInt(durationMatch[1] ?? "", 10);
    if (!Number.isNaN(minutes) && minutes >= 15 && minutes <= 180) {
      candidates.push({
        category: "pedagogical",
        scope: "teacher",
        statement: `Lessons are ${minutes} minutes long by default.`,
        evidence: `Teacher said: "${truncate(source, 140)}"`,
        confidence: 0.92,
      });
    }
  }

  if (classRef) {
    const classDurationMatch = source.match(
      /\b(?:for|in)\s+class\s+\w+\b[\s\S]*?\b(\d{2,3})\s*minutes?\b/i,
    );
    if (classDurationMatch) {
      const minutes = Number.parseInt(classDurationMatch[1] ?? "", 10);
      if (!Number.isNaN(minutes) && minutes >= 15 && minutes <= 180) {
        candidates.push({
          category: "class",
          scope: "class",
          classId: classRef,
          statement: `Typical lesson duration for ${classRef} is ${minutes} minutes.`,
          evidence: `Teacher said: "${truncate(source, 140)}"`,
          confidence: 0.88,
        });
      }
    }
  }

  return candidates;
}

function memoryPathForCandidate(candidate: MemoryExtractionCandidate): string {
  return candidate.scope === "class" && candidate.classId
    ? `classes/${candidate.classId}/MEMORY.md`
    : "MEMORY.md";
}

async function readMemoryOrEmpty(
  teacherId: string,
  path: string,
): Promise<string> {
  try {
    return await readMemoryFile(teacherId, path);
  } catch {
    return "";
  }
}

function isNovelCandidate(
  candidate: MemoryExtractionCandidate,
  teacherMemory: string,
  classMemoryById: Map<string, string>,
  accepted: MemoryExtractionCandidate[],
): boolean {
  const existingContent =
    candidate.scope === "class" && candidate.classId
      ? (classMemoryById.get(candidate.classId) ?? "")
      : teacherMemory;

  const existingEntries = categoryEntries(existingContent, candidate.category);
  if (
    existingEntries.some(
      (entry) => memorySimilarity(entry, candidate.statement) >= 0.84,
    )
  ) {
    return false;
  }

  const sameLaneAccepted = accepted.filter((item) => {
    if (
      item.scope !== candidate.scope ||
      item.category !== candidate.category
    ) {
      return false;
    }
    if (item.scope === "class") {
      return item.classId === candidate.classId;
    }
    return true;
  });

  return !sameLaneAccepted.some(
    (item) => memorySimilarity(item.statement, candidate.statement) >= 0.84,
  );
}

export async function extractNovelMemoryProposals(
  params: ExtractMemoryProposalsParams,
): Promise<MemoryProposal[]> {
  const classRef = params.classRef
    ? normalizeClassId(params.classRef)
    : undefined;
  const extractionMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable memory preferences for a teaching assistant system. Return strict JSON only. Do not include markdown, prose, or code fences.",
    },
    {
      role: "user",
      content: `Extract durable memory candidates from this exchange.

Only include stable preferences/constraints. Ignore one-off requests, task summaries, and copied prompt text.

Allowed categories:
- personal: teacher workflow/interaction preference
- pedagogical: instructional strategy preference
- class: class-specific learning about what works

Return JSON exactly with this shape:
{
  "candidates": [
    {
      "category": "personal|pedagogical|class",
      "statement": "single durable preference",
      "classId": "required when category is class",
      "evidence": "short evidence snippet from the exchange",
      "confidence": 0.0
    }
  ]
}

Class reference in this turn: ${classRef ?? "(none)"}

Latest inbound teacher message:
${params.latestUserMessage || "(empty)"}

Latest outbound assistant message:
${params.finalAssistantMessage || "(empty)"}

Recent context:
${formatRecentMessages(params.recentMessages)}
`,
    },
  ];

  let responseText = "";
  try {
    const response = await callModel(
      params.provider,
      params.model,
      extractionMessages,
      MEMORY_EXTRACTOR_MAX_TOKENS,
    );
    responseText = response.content;
  } catch (error) {
    console.warn("[memory] extraction skipped:", error);
    return [];
  }

  const parsed = parseJsonObject(responseText);
  const rawCandidates = Array.isArray(parsed?.candidates)
    ? parsed.candidates
    : [];

  const normalizedCandidates = rawCandidates
    .map((candidate) => normalizeCandidate(candidate, classRef))
    .filter((candidate): candidate is MemoryExtractionCandidate =>
      Boolean(candidate),
    );
  const fallbackCandidates = heuristicCandidatesFromLatestUserMessage(
    params.latestUserMessage,
    classRef,
  );
  const candidatePool = [...normalizedCandidates, ...fallbackCandidates];

  if (candidatePool.length === 0) {
    return [];
  }

  const teacherMemory = await readMemoryOrEmpty(params.teacherId, "MEMORY.md");
  const classIds = [
    ...new Set(
      candidatePool
        .filter((candidate) => candidate.scope === "class" && candidate.classId)
        .map((candidate) => candidate.classId as string),
    ),
  ];

  const classMemoryById = new Map<string, string>();
  await Promise.all(
    classIds.map(async (classId) => {
      const content = await readMemoryOrEmpty(
        params.teacherId,
        `classes/${classId}/MEMORY.md`,
      );
      classMemoryById.set(classId, content);
    }),
  );

  const accepted: MemoryExtractionCandidate[] = [];
  for (const candidate of candidatePool) {
    if (
      !isNovelCandidate(candidate, teacherMemory, classMemoryById, accepted)
    ) {
      continue;
    }
    accepted.push(candidate);
    if (accepted.length >= MAX_PROPOSALS) {
      break;
    }
  }

  return accepted.map((candidate) => ({
    id: randomUUID(),
    text: candidate.statement,
    scope: candidate.scope,
    classId: candidate.classId,
    category: candidate.category,
    evidence: candidate.evidence,
    confidence: candidate.confidence,
    sourcePath: memoryPathForCandidate(candidate),
  }));
}
