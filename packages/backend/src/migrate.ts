import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { getDataSource } from "./db";

const migrationsDir = resolve(import.meta.dir, "../db/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) {
  console.log("No migration files found.");
  process.exit(0);
}

const ds = await getDataSource();

await ds.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

for (const filename of migrationFiles) {
  const applied = (await ds.query(
    `
    SELECT 1 FROM schema_migrations
    WHERE filename = $1
    LIMIT 1
    `,
    [filename],
  )) as Array<{ "?column?": number }>;

  if (applied.length > 0) {
    console.log(`skip ${filename}`);
    continue;
  }

  const queryRunner = ds.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const sqlText = readFileSync(resolve(migrationsDir, filename), "utf8");
    await queryRunner.query(sqlText);
    await queryRunner.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename],
    );
    await queryRunner.commitTransaction();
    console.log(`applied ${filename}`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

console.log("Migrations complete.");
