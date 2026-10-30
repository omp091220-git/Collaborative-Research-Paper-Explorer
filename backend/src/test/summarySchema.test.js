import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const migrationPath = path.join(projectRoot, "database/20261025_fr08_ai_summaries.sql");
const schemaPath = path.join(projectRoot, "database/schema.sql");

 test("FR-08 migration and fresh-install schema contain matching cache associations and cleanup", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const schema = await readFile(schemaPath, "utf8");

  for (const sql of [migration, schema]) {
    assert.match(sql, /ALTER TABLE paper_summaries[\s\S]*structured_sections JSONB/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paper_summary_cache\s*\(/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paper_summary_cache_papers\s*\(/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paper_summary_jobs\s*\(/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION cleanup_orphaned_paper_summary_cache_after_paper_delete/i);
    assert.match(sql, /CREATE TRIGGER trg_cleanup_orphaned_paper_summary_cache\s+AFTER DELETE ON papers/i);
    assert.match(sql, /DELETE FROM paper_summary_cache c[\s\S]*NOT EXISTS/i);
  }

  // Confirm the migration does not perform destructive schema/data operations.
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+papers\b/i);
});
