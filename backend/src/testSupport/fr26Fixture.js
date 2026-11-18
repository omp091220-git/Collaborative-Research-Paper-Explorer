import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const ids = {
  author: 'a1111111-1111-4111-8111-111111111111',
  privateAuthor: 'b2222222-2222-4222-8222-222222222222',
  admin: 'c3333333-3333-4333-8333-333333333333',
  reader: 'd4444444-4444-4444-8444-444444444444',
  paper: 'e5555555-5555-4555-8555-555555555555',
  privatePost: 'f6666666-6666-4666-8666-666666666666',
  legacyPost: 'f7777777-7777-4777-8777-777777777777',
  specialPost: 'f8888888-8888-4888-8888-888888888888',
};
export async function prepareFr26Fixture(url = process.env.TEST_DATABASE_URL) {
  const parsed = new URL(url || '');
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.includes('test')
  )
    throw new Error('FR-26 fixtures require a localhost test database.');
  const schema = 'fr26_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({ connectionString: parsed.href });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({
    connectionString: parsed.href,
    options: `-c search_path=${schema},public`,
  });
  const cleanup = async () => {
    await db.end();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await admin.end();
    }
  };
  try {
    await db.query(
      await fs.readFile(
        new URL('../../../database/schema.sql', import.meta.url),
        'utf8',
      ),
    );
    // The historical FR-25 migration checks enum names globally. Test schemas get
    // their own enum definitions so concurrent tests cannot borrow each other's types.
    await db.query(
      "CREATE TYPE user_account_type AS ENUM ('PUBLIC','PRIVATE'); CREATE TYPE post_visibility AS ENUM ('PUBLIC','PRIVATE'); CREATE TYPE post_permission_level AS ENUM ('READ','WRITE');",
    );
    await db.query(
      await fs.readFile(
        new URL(
          '../../../database/20261118_account_type_and_posts.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    for (const [id, name, type, role] of [
      [ids.author, 'Public Scholar', 'PUBLIC', 'RESEARCHER'],
      [ids.privateAuthor, 'Private Scholar', 'PRIVATE', 'RESEARCHER'],
      [ids.admin, 'Moderator', 'PUBLIC', 'STUDENT'],
      [ids.reader, 'Student Reader', 'PUBLIC', 'STUDENT'],
    ]) {
      await db.query(
        "INSERT INTO users(id,email,password_hash,full_name,account_type,role) VALUES($1,$2,'not-a-real-password',$3,$4,$5)",
        [id, id + '@example.edu', name, type, role],
      );
    }
    await db.query("UPDATE users SET role='SYSTEM_ADMIN' WHERE id=$1", [
      ids.admin,
    ]);
    await db.query(
      "INSERT INTO papers(id,title,authors,file_path,file_size_bytes,mime_type,uploader_id) VALUES($1,'Linked public research',ARRAY['Scholar'],'uploads/fr26-fixture.pdf',100,'application/pdf',$2)",
      [ids.paper, ids.author],
    );
    const posts = [];
    for (let i = 0; i < 30; i++) {
      const id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      posts.push(id);
      await db.query(
        "INSERT INTO posts(id,author_id,title,content,tags,visibility,paper_id,created_at) VALUES($1,$2,$3,$4,$5,'PUBLIC',$6,$7)",
        [
          id,
          ids.author,
          `Public discovery ${String(i).padStart(2, '0')}`,
          `Visible research evidence ${i}. ${i === 25 ? 'Unique body keyword: photosynthesis.' : ''}`,
          i % 2 === 0 ? ['biology', 'open-science'] : ['physics'],
          i === 0 ? ids.paper : null,
          new Date(Date.UTC(2026, 10, 1, 12, 0, i)),
        ],
      );
    }
    await db.query(
      "INSERT INTO posts(id,author_id,title,content,tags,visibility) VALUES($1,$2,'PRIVATE_CANARY unique secret','This private content must never reach public discovery.',ARRAY['secret-private'],'PRIVATE')",
      [ids.privatePost, ids.author],
    );
    // A pre-existing inconsistent row tests defense in depth after an account switch.
    await db.query(
      "INSERT INTO posts(id,author_id,title,content,tags,visibility) VALUES($1,$2,'LEGACY_PRIVATE_ACCOUNT_CANARY','Never public while its author is private.',ARRAY['secret-private'],'PUBLIC')",
      [ids.legacyPost, ids.privateAuthor],
    );
    await db.query(
      "INSERT INTO posts(id,author_id,title,content,tags,visibility,created_at) VALUES($1,$2,'Literal 100%_study','<img src=x onerror=window.__fr26_xss=true> Text is rendered literally.',ARRAY['literal'], 'PUBLIC','2026-11-01T12:00:31Z')",
      [ids.specialPost, ids.author],
    );
    await db.query(
      "INSERT INTO post_permissions(post_id,user_id,permission_level,granted_by) VALUES($1,$2,'READ',$3)",
      [ids.privatePost, ids.reader, ids.author],
    );
    parsed.searchParams.set('options', `-c search_path=${schema},public`);
    return { db, cleanup, ids, posts, schema, connectionString: parsed.href };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
