export type MemoryCategory = "personal" | "pedagogical" | "class";

export const MEMORY_CATEGORY_HEADINGS: Record<MemoryCategory, string> = {
  personal: "Personal Preferences",
  pedagogical: "Pedagogical Preferences",
  class: "Class-Based Learnings",
};

interface ParsedMemorySections {
  personal: string[];
  pedagogical: string[];
  class: string[];
  unscoped: string[];
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function toHeadingRegex(heading: string): RegExp {
  return new RegExp(
    `^##\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i",
  );
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[-*]\s+/, "").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = normalizeComparable(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value.trim());
  }

  return result;
}

function parseMemorySections(content: string): ParsedMemorySections {
  const sections: ParsedMemorySections = {
    personal: [],
    pedagogical: [],
    class: [],
    unscoped: [],
  };

  const lines = normalizeLineEndings(content).split("\n");
  let current: MemoryCategory | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (toHeadingRegex(MEMORY_CATEGORY_HEADINGS.personal).test(line)) {
      current = "personal";
      continue;
    }
    if (toHeadingRegex(MEMORY_CATEGORY_HEADINGS.pedagogical).test(line)) {
      current = "pedagogical";
      continue;
    }
    if (toHeadingRegex(MEMORY_CATEGORY_HEADINGS.class).test(line)) {
      current = "class";
      continue;
    }

    if (!/^[-*]\s+/.test(line)) {
      continue;
    }

    const text = stripBulletPrefix(line);
    if (!text) {
      continue;
    }

    if (current) {
      sections[current].push(text);
    } else {
      sections.unscoped.push(text);
    }
  }

  sections.personal = unique(sections.personal);
  sections.pedagogical = unique(sections.pedagogical);
  sections.class = unique(sections.class);
  sections.unscoped = unique(sections.unscoped);

  return sections;
}

export function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'’“”]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  const normalized = normalizeComparable(value);
  if (!normalized) {
    return new Set();
  }
  return new Set(normalized.split(" ").filter((token) => token.length >= 3));
}

function tokenJaccard(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function memorySimilarity(a: string, b: string): number {
  const normA = normalizeComparable(a);
  const normB = normalizeComparable(b);
  if (!normA || !normB) {
    return 0;
  }
  if (normA === normB) {
    return 1;
  }

  const longer = normA.length >= normB.length ? normA : normB;
  const shorter = longer === normA ? normB : normA;
  if (shorter.length >= 16 && longer.includes(shorter)) {
    return 0.94;
  }

  return tokenJaccard(normA, normB);
}

export function categoryEntries(
  content: string,
  category: MemoryCategory,
): string[] {
  const sections = parseMemorySections(content);
  return unique([...sections[category], ...sections.unscoped]);
}

export function isNovelEntry(
  content: string,
  category: MemoryCategory,
  statement: string,
  threshold = 0.84,
): boolean {
  const existing = categoryEntries(content, category);
  return !existing.some(
    (candidate) => memorySimilarity(candidate, statement) >= threshold,
  );
}

function ensureCategorySections(lines: string[]): string[] {
  const withSections = [...lines];

  for (const category of Object.keys(
    MEMORY_CATEGORY_HEADINGS,
  ) as MemoryCategory[]) {
    const heading = MEMORY_CATEGORY_HEADINGS[category];
    const regex = toHeadingRegex(heading);
    if (withSections.some((line) => regex.test(line.trim()))) {
      continue;
    }
    if (
      withSections.length > 0 &&
      withSections[withSections.length - 1]?.trim() !== ""
    ) {
      withSections.push("");
    }
    withSections.push(`## ${heading}`);
    withSections.push("");
  }

  return withSections;
}

function sectionBounds(
  lines: string[],
  category: MemoryCategory,
): { start: number; end: number } {
  const headingRegexes = (
    Object.keys(MEMORY_CATEGORY_HEADINGS) as MemoryCategory[]
  ).map((name) => ({
    name,
    regex: toHeadingRegex(MEMORY_CATEGORY_HEADINGS[name]),
  }));
  const headingIndex = lines.findIndex((line) =>
    toHeadingRegex(MEMORY_CATEGORY_HEADINGS[category]).test(line.trim()),
  );
  if (headingIndex < 0) {
    return { start: lines.length, end: lines.length };
  }

  let nextHeading = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (headingRegexes.some((heading) => heading.regex.test(line))) {
      nextHeading = index;
      break;
    }
  }

  return {
    start: headingIndex + 1,
    end: nextHeading,
  };
}

export function upsertCategoryEntry(
  content: string,
  category: MemoryCategory,
  statement: string,
): { content: string; inserted: boolean } {
  const trimmedStatement = statement.trim().replace(/\s+/g, " ");
  if (!trimmedStatement) {
    return { content, inserted: false };
  }

  if (!isNovelEntry(content, category, trimmedStatement)) {
    return { content, inserted: false };
  }

  const normalized = normalizeLineEndings(content).trimEnd();
  const lines = ensureCategorySections(
    normalized.length > 0 ? normalized.split("\n") : [],
  );

  const bounds = sectionBounds(lines, category);
  let insertAt = bounds.end;
  while (
    insertAt > bounds.start &&
    (lines[insertAt - 1]?.trim() ?? "") === ""
  ) {
    insertAt -= 1;
  }

  lines.splice(insertAt, 0, `- ${trimmedStatement}`);
  const nextContent = `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
  return {
    content: nextContent,
    inserted: true,
  };
}
