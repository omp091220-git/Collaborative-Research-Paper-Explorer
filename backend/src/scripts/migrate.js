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
    '20261026_genai_usage_tracking.sql',
  ];

  console.log('--- Starting Database Migrations ---');
  const client = await pool.connect();

  try {
    for (const fileName of migrationFiles) {
      const filePath = path.join(migrationsDir, fileName);
      if (!fs.existsSync(filePath)) {
        console.warn(`[WARN] Migration file not found: ${filePath}`);
        continue;
      }

      console.log(`[APPLYING] ${fileName}...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      await client.query(sql);
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
