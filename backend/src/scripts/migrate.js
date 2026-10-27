import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../../../database');
  const migrationFiles = [
    '20261017_email_verification.sql',
    '20261017_sso_identities.sql',
    '20261018_sessions.sql',
    '20261018_roles_and_permissions.sql',
    '20261018_rbac.sql',
    '20261019_annotations.sql',
    '20261024_topic_tags.sql',
    '20261025_discussions_and_collaborators.sql',
    '20261027_citations.sql',
  ];

  console.log('--- Starting Database Migrations ---');
  const client = await pool.connect();

  try {
    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Fetch already applied migrations
    const appliedResult = await client.query('SELECT name FROM schema_migrations');
    const appliedSet = new Set(appliedResult.rows.map(r => r.name));

    for (const fileName of migrationFiles) {
      if (appliedSet.has(fileName)) {
        console.log(`[SKIPPED] ${fileName} already applied.`);
        continue;
      }

      const filePath = path.join(migrationsDir, fileName);
      if (!fs.existsSync(filePath)) {
        console.warn(`[WARN] Migration file not found: ${filePath}`);
        continue;
      }

      console.log(`[APPLYING] ${fileName}...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [fileName]
      );
      await client.query('COMMIT');
      console.log(`[SUCCESS] ${fileName} applied successfully.`);
    }

    console.log('--- All migrations executed successfully ---');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
