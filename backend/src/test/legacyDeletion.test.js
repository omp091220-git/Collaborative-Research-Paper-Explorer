import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import annotationRoutes from '../routes/annotation.routes.js';
import paperTagRoutes from '../routes/paperTagAssignment.routes.js';
import pool from '../config/database.js';

const TEST_SECRET = process.env.JWT_SECRET || 'test-secret-for-deletion-tests-123456';
const RESEARCHER_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_USER_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_USER_ID = '44444444-4444-4444-8444-444444444444';

const ANNOTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSIGNMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAPER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TAG_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/annotations', annotationRoutes);
  app.use('/api/paper-tags', paperTagRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '5m' });
}

function mockDatabase(currentUser, queryMock) {
  pool.query = async (sql, params) => {
    const text = String(sql);
    // User lookup for auth middleware
    if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
      return {
        rows: [
          {
            id: currentUser.id,
            email: currentUser.email || 'user@example.com',
            full_name: currentUser.name || 'Test User',
            role: currentUser.role,
          },
        ],
      };
    }
    return queryMock(text, params);
  };
}

// ---------------------------------------------------------------------------
// 1. Annotation Deletion Tests
// ---------------------------------------------------------------------------
test('Annotation Deletion: Unauthenticated request returns 401', async () => {
  const app = createTestApp();
  const res = await request(app).delete(`/api/annotations/${ANNOTATION_ID}`);
  assert.strictEqual(res.status, 401);
});

test('Annotation Deletion: Student role is rejected with 403', async () => {
  mockDatabase({ id: STUDENT_USER_ID, role: 'STUDENT' }, async () => ({ rows: [] }));
  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(STUDENT_USER_ID, 'STUDENT')}`);
  assert.strictEqual(res.status, 403);
});

test('Annotation Deletion: Deleting nonexistent annotation returns 404', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async () => ({ rows: [] }));
  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'Annotation not found.');
});

test('Annotation Deletion: Researcher can delete their own newly created annotation', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('SELECT id, created_by FROM annotations')) {
      return { rows: [{ id: ANNOTATION_ID, created_by: RESEARCHER_USER_ID }] };
    }
    if (sql.includes('DELETE FROM annotations')) {
      return { rows: [{ id: ANNOTATION_ID }] };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.id, ANNOTATION_ID);
});

test('Annotation Deletion: Researcher cannot delete another user annotation (403)', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('SELECT id, created_by FROM annotations')) {
      return { rows: [{ id: ANNOTATION_ID, created_by: OTHER_USER_ID }] };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'You can only delete your own annotations.');
});

test('Annotation Deletion: Researcher cannot delete legacy annotation without creator (403)', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('SELECT id, created_by FROM annotations')) {
      return { rows: [{ id: ANNOTATION_ID, created_by: null }] };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /Legacy annotations without ownership metadata/);
});

test('Annotation Deletion: System Admin can delete any annotation including legacy', async () => {
  mockDatabase({ id: ADMIN_USER_ID, role: 'SYSTEM_ADMIN' }, async (sql) => {
    if (sql.includes('DELETE FROM annotations')) {
      return { rows: [{ id: ANNOTATION_ID }] };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set('Authorization', `Bearer ${tokenFor(ADMIN_USER_ID, 'SYSTEM_ADMIN')}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.id, ANNOTATION_ID);
});

// ---------------------------------------------------------------------------
// 2. Paper-Tag Assignment Removal Tests
// ---------------------------------------------------------------------------
test('Paper-Tag Deletion: Unauthenticated request returns 401', async () => {
  const app = createTestApp();
  const res = await request(app).delete(`/api/paper-tags/${ASSIGNMENT_ID}`);
  assert.strictEqual(res.status, 401);
});

test('Paper-Tag Deletion: Student role is rejected with 403', async () => {
  mockDatabase({ id: STUDENT_USER_ID, role: 'STUDENT' }, async () => ({ rows: [] }));
  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(STUDENT_USER_ID, 'STUDENT')}`);
  assert.strictEqual(res.status, 403);
});

test('Paper-Tag Deletion: Nonexistent assignment returns 404', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async () => ({ rows: [] }));
  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'Assignment not found.');
});

test('Paper-Tag Deletion: Researcher can remove their own assignment', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('FROM paper_tag_assignments pta') && sql.includes('WHERE pta.id = $1')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: RESEARCHER_USER_ID,
            tag_name: 'Machine Learning',
            tag_slug: 'machine-learning',
          },
        ],
      };
    }
    if (sql.includes('DELETE FROM paper_tag_assignments')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: RESEARCHER_USER_ID,
          },
        ],
      };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.body.message, /Tag assignment removed successfully/);
});

test('Paper-Tag Deletion: Researcher cannot remove another user assignment (403)', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('FROM paper_tag_assignments pta')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: OTHER_USER_ID,
            tag_name: 'Machine Learning',
            tag_slug: 'machine-learning',
          },
        ],
      };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'Forbidden. You can only remove assignments you created.');
});

test('Paper-Tag Deletion: Researcher cannot remove legacy assignment without assigner metadata (403)', async () => {
  mockDatabase({ id: RESEARCHER_USER_ID, role: 'RESEARCHER' }, async (sql) => {
    if (sql.includes('FROM paper_tag_assignments pta')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: null,
            tag_name: 'Machine Learning',
            tag_slug: 'machine-learning',
          },
        ],
      };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(RESEARCHER_USER_ID, 'RESEARCHER')}`);
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /Legacy tag assignments without creator metadata/);
});

test('Paper-Tag Deletion: System Admin can remove any assignment including legacy', async () => {
  mockDatabase({ id: ADMIN_USER_ID, role: 'SYSTEM_ADMIN' }, async (sql) => {
    if (sql.includes('FROM paper_tag_assignments pta')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: null,
            tag_name: 'Machine Learning',
            tag_slug: 'machine-learning',
          },
        ],
      };
    }
    if (sql.includes('DELETE FROM paper_tag_assignments')) {
      return {
        rows: [
          {
            id: ASSIGNMENT_ID,
            paper_id: PAPER_ID,
            tag_id: TAG_ID,
            assigned_by: null,
          },
        ],
      };
    }
    return { rows: [] };
  });

  const app = createTestApp();
  const res = await request(app)
    .delete(`/api/paper-tags/${ASSIGNMENT_ID}`)
    .set('Authorization', `Bearer ${tokenFor(ADMIN_USER_ID, 'SYSTEM_ADMIN')}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.body.message, /Tag assignment removed successfully/);
});
