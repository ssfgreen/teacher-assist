import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SQL } from "bun";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for migrations. Set it in .env before running `bun run migrate`.",
  );
}

const migrationsDir = resolve(import.meta.dir, "../db/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) {
  console.log("No migration files found.");
  process.exit(0);
}

const sql = new SQL(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

for (const filename of migrationFiles) {
  const applied = (await sql`
    SELECT 1 FROM schema_migrations
    WHERE filename = ${filename}
    LIMIT 1
  `) as Array<{ "?column?": number }>;

  if (applied.length > 0) {
    console.log(`skip ${filename}`);
    continue;
  }

  const sqlText = readFileSync(resolve(migrationsDir, filename), "utf8");
  await sql.unsafe(sqlText);
  await sql`
    INSERT INTO schema_migrations (filename)
    VALUES (${filename})
  `;
  console.log(`applied ${filename}`);
}

await sql.close();
console.log("Migrations complete.");
