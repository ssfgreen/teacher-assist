export const CLASS_REF_PATTERN = /\b([1-6][A-Za-z])\b/g;

export const DEFAULT_SOUL = `# Assistant Identity

You are a practical lesson-planning assistant.

## Working stance
- Draft, do not decide for the teacher.
- Be explicit about tradeoffs and assumptions.
- Do not claim curriculum alignment without evidence from workspace files.
`;

const DEFAULT_TEACHER = `# Teacher Profile

- Name:
- School:
- Subject specialism:
- Year groups taught:
`;

const DEFAULT_PEDAGOGY = `# Pedagogy Preferences

- Preferred lesson structure:
- Differentiation approaches:
- Assessment style:
- Classroom routines:
`;

const DEFAULT_CURRICULUM_STUB = `# Curriculum Notes

Add curriculum references and copied excerpts here.
`;

const DEFAULT_CLASS_STUB = `# Class Profile

- Size:
- Stage:
- Needs:
- Prior learning:
`;

export const CLASS_PROFILE_FILENAME = "CLASS.md";

export const DEFAULT_WORKSPACE_FILES: Array<{ path: string; content: string }> =
  [
    { path: "soul.md", content: DEFAULT_SOUL },
    { path: "teacher.md", content: DEFAULT_TEACHER },
    { path: "pedagogy.md", content: DEFAULT_PEDAGOGY },
    { path: "curriculum/README.md", content: DEFAULT_CURRICULUM_STUB },
    { path: "classes/README.md", content: DEFAULT_CLASS_STUB },
  ];

export const WORKSPACE_DB_CONFIG_ERROR =
  "Workspace storage requires PostgreSQL. Ensure Postgres is running (`docker compose up -d`) and run `cd packages/backend && bun run migrate`.";

export function knownSubjectTokens(): string[] {
  return [
    "computing",
    "science",
    "math",
    "mathematics",
    "history",
    "english",
    "biology",
    "chemistry",
    "physics",
    "geography",
    "music",
    "drama",
    "art",
  ];
}

export function classProfilePath(classRef: string): string {
  return `classes/${classRef}/${CLASS_PROFILE_FILENAME}`;
}
