import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import {
  isValidUUID,
  validateCreateAssignment,
  validateUUIDParam,
  parsePagination,
} from '../utils/paperTagAssignmentValidation.js';
import * as repo from '../repositories/paperTagAssignment.repository.js';
import * as service from '../services/paperTagAssignment.service.js';
import { assertSafeTestDatabase } from './safetyCheck.js';

describe('FR-11: Paper Tag Assignments Test Suite (A–Z)', () => {
  let server;
  let baseUrl;
  let client;

  // Dedicated test UUIDs for isolation
  const adminUser = {
    id: 'f1100000-0000-4000-8000-000000000001',
    email: 'admin_fr11@test.edu',
    role: ROLES.SYSTEM_ADMIN,
  };
  const researcherUser1 = {
    id: 'f1100000-0000-4000-8000-000000000002',
    email: 'researcher1_fr11@test.edu',
    role: ROLES.RESEARCHER,
  };
  const researcherUser2 = {
    id: 'f1100000-0000-4000-8000-000000000003',
    email: 'researcher2_fr11@test.edu',
    role: ROLES.RESEARCHER,
  };
  const studentUser = {
    id: 'f1100000-0000-4000-8000-000000000004',
    email: 'student_fr11@test.edu',
    role: ROLES.STUDENT,
  };

  const paper1 = {
    id: 'f1110000-0000-4000-8000-000000000001',
    title: 'FR11 Renewable Energy Deep Dive',
    abstract: 'A deep dive into solar and wind materials.',
    authors: ['Dr. Shyam', 'Prof. Smith'],
    file_path: 'uploads/test_paper1.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
  };

  const paper2 = {
    id: 'f1110000-0000-4000-8000-000000000002',
    title: 'FR11 Quantum Computing Architecture',
    abstract: 'Qubits and superconducting circuits.',
    authors: ['Dr. Alice'],
    file_path: 'uploads/test_paper2.pdf',
    file_size_bytes: 2048,
    mime_type: 'application/pdf',
  };

  const annotation1 = {
    id: 'f1120000-0000-4000-8000-000000000001',
    paper_id: paper1.id,
    page_number: 1,
    content: 'Section 1.2: Perovskite solar cell efficiency gains.',
    position_x: 0.1,
    position_y: 0.2,
    region_width: 0.8,
    region_height: 0.3,
  };

  const annotation2 = {
    id: 'f1120000-0000-4000-8000-000000000002',
    paper_id: paper1.id,
    page_number: 2,
    content: 'Section 2.1: Wind turbine blade aerodynamics.',
    position_x: 0.15,
    position_y: 0.25,
    region_width: 0.7,
    region_height: 0.4,
  };

  const annotationPaper2 = {
    id: 'f1120000-0000-4000-8000-000000000003',
    paper_id: paper2.id,
    page_number: 1,
    content: 'Section 1.1: Qubit coherence times.',
    position_x: 0.2,
    position_y: 0.3,
    region_width: 0.6,
    region_height: 0.2,
  };

  const rootTag = {
    id: 'f1130000-0000-4000-8000-000000000001',
    name: 'FR11 Energy',
    slug: 'fr11_energy',
  };

  const childTag1 = {
    id: 'f1130000-0000-4000-8000-000000000002',
    name: 'FR11 Solar Panels',
    slug: 'fr11_solar_panels',
    parent_id: rootTag.id,
  };

  const childTag2 = {
    id: 'f1130000-0000-4000-8000-000000000003',
    name: 'FR11 Wind Energy',
    slug: 'fr11_wind_energy',
    parent_id: rootTag.id,
  };

  let adminToken;
  let researcherToken1;
  let researcherToken2;
  let studentToken;

  const authHeaders = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  before(async () => {
    // 0. Safety verification: refuse destructive setup/cleanup if database is unsafe
    assertSafeTestDatabase();

    // 1. Start HTTP server on dynamic port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const secret = process.env.JWT_SECRET;
    adminToken = jwt.sign(adminUser, secret, { expiresIn: '1h' });
    researcherToken1 = jwt.sign(researcherUser1, secret, { expiresIn: '1h' });
    researcherToken2 = jwt.sign(researcherUser2, secret, { expiresIn: '1h' });
    studentToken = jwt.sign(studentUser, secret, { expiresIn: '1h' });

    client = await pool.connect();

    // 2. Insert test users
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES 
        ('${adminUser.id}', '${adminUser.email}', 'hash123', 'FR11 Admin', 'RESEARCHER'),
        ('${researcherUser1.id}', '${researcherUser1.email}', 'hash123', 'FR11 Researcher 1', 'RESEARCHER'),
        ('${researcherUser2.id}', '${researcherUser2.email}', 'hash123', 'FR11 Researcher 2', 'RESEARCHER'),
        ('${studentUser.id}', '${studentUser.email}', 'hash123', 'FR11 Student', 'STUDENT')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `);

    await client.query(`
      UPDATE users SET role = 'SYSTEM_ADMIN' WHERE id = '${adminUser.id}';
    `);

    // 3. Clean prior test records in reverse dependency order
    await client.query(`DELETE FROM paper_tag_assignments WHERE paper_id IN ('${paper1.id}', '${paper2.id}')`);
    await client.query(`DELETE FROM annotations WHERE paper_id IN ('${paper1.id}', '${paper2.id}')`);
    await client.query(`DELETE FROM papers WHERE id IN ('${paper1.id}', '${paper2.id}')`);
    await client.query(`DELETE FROM topic_tags WHERE id IN ('${childTag1.id}', '${childTag2.id}', '${rootTag.id}')`);

    // 4. Insert test papers
    await client.query(`
      INSERT INTO papers (id, title, abstract, authors, file_path, file_size_bytes, mime_type, uploader_id)
      VALUES 
        ('${paper1.id}', '${paper1.title}', '${paper1.abstract}', $1, '${paper1.file_path}', ${paper1.file_size_bytes}, '${paper1.mime_type}', '${researcherUser1.id}'),
        ('${paper2.id}', '${paper2.title}', '${paper2.abstract}', $2, '${paper2.file_path}', ${paper2.file_size_bytes}, '${paper2.mime_type}', '${researcherUser2.id}')
    `, [paper1.authors, paper2.authors]);

    // 5. Insert test annotations
    await client.query(`
      INSERT INTO annotations (id, paper_id, created_by, page_number, content, position_x, position_y, region_width, region_height)
      VALUES 
        ('${annotation1.id}', '${annotation1.paper_id}', '${researcherUser1.id}', ${annotation1.page_number}, '${annotation1.content}', ${annotation1.position_x}, ${annotation1.position_y}, ${annotation1.region_width}, ${annotation1.region_height}),
        ('${annotation2.id}', '${annotation2.paper_id}', '${researcherUser1.id}', ${annotation2.page_number}, '${annotation2.content}', ${annotation2.position_x}, ${annotation2.position_y}, ${annotation2.region_width}, ${annotation2.region_height}),
        ('${annotationPaper2.id}', '${annotationPaper2.paper_id}', '${researcherUser2.id}', ${annotationPaper2.page_number}, '${annotationPaper2.content}', ${annotationPaper2.position_x}, ${annotationPaper2.position_y}, ${annotationPaper2.region_width}, ${annotationPaper2.region_height})
    `);

    // 6. Insert test topic tags
    await client.query(`
      INSERT INTO topic_tags (id, name, slug, parent_id, created_by)
      VALUES 
        ('${rootTag.id}', '${rootTag.name}', '${rootTag.slug}', NULL, '${adminUser.id}'),
        ('${childTag1.id}', '${childTag1.name}', '${childTag1.slug}', '${rootTag.id}', '${adminUser.id}'),
        ('${childTag2.id}', '${childTag2.name}', '${childTag2.slug}', '${rootTag.id}', '${adminUser.id}')
    `);
  });

  after(async () => {
    try {
      if (client) {
        await client.query(`DELETE FROM paper_tag_assignments WHERE paper_id IN ('${paper1.id}', '${paper2.id}')`);
        await client.query(`DELETE FROM annotations WHERE paper_id IN ('${paper1.id}', '${paper2.id}')`);
        await client.query(`DELETE FROM papers WHERE id IN ('${paper1.id}', '${paper2.id}')`);
        await client.query(`DELETE FROM topic_tags WHERE id IN ('${childTag1.id}', '${childTag2.id}', '${rootTag.id}')`);
        await client.query(`
          DELETE FROM users WHERE id IN (
            '${adminUser.id}', '${researcherUser1.id}', '${researcherUser2.id}', '${studentUser.id}'
          )
        `);
        client.release();
      }
    } finally {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  });

  // Clean tag assignments created during individual tests and ensure fixtures exist
  beforeEach(async () => {
    await pool.query(`DELETE FROM paper_tag_assignments WHERE paper_id IN ('${paper1.id}', '${paper2.id}')`);
    await pool.query(`
      INSERT INTO papers (id, title, abstract, authors, file_path, file_size_bytes, mime_type, uploader_id)
      VALUES 
        ('${paper1.id}', '${paper1.title}', '${paper1.abstract}', $1, '${paper1.file_path}', ${paper1.file_size_bytes}, '${paper1.mime_type}', '${researcherUser1.id}'),
        ('${paper2.id}', '${paper2.title}', '${paper2.abstract}', $2, '${paper2.file_path}', ${paper2.file_size_bytes}, '${paper2.mime_type}', '${researcherUser2.id}')
      ON CONFLICT (id) DO NOTHING
    `, [paper1.authors, paper2.authors]);
    await pool.query(`
      INSERT INTO annotations (id, paper_id, created_by, page_number, content, position_x, position_y, region_width, region_height)
      VALUES 
        ('${annotation1.id}', '${annotation1.paper_id}', '${researcherUser1.id}', ${annotation1.page_number}, '${annotation1.content}', ${annotation1.position_x}, ${annotation1.position_y}, ${annotation1.region_width}, ${annotation1.region_height}),
        ('${annotation2.id}', '${annotation2.paper_id}', '${researcherUser1.id}', ${annotation2.page_number}, '${annotation2.content}', ${annotation2.position_x}, ${annotation2.position_y}, ${annotation2.region_width}, ${annotation2.region_height}),
        ('${annotationPaper2.id}', '${annotationPaper2.paper_id}', '${researcherUser2.id}', ${annotationPaper2.page_number}, '${annotationPaper2.content}', ${annotationPaper2.position_x}, ${annotationPaper2.position_y}, ${annotationPaper2.region_width}, ${annotationPaper2.region_height})
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO topic_tags (id, name, slug, parent_id, created_by)
      VALUES 
        ('${rootTag.id}', '${rootTag.name}', '${rootTag.slug}', NULL, '${adminUser.id}'),
        ('${childTag1.id}', '${childTag1.name}', '${childTag1.slug}', '${rootTag.id}', '${adminUser.id}'),
        ('${childTag2.id}', '${childTag2.name}', '${childTag2.slug}', '${rootTag.id}', '${adminUser.id}')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  // ============================================================================
  // SECTION 1: VALIDATION UTILITY TESTS
  // ============================================================================
  describe('1. Pure Validation Utility Tests', () => {
    it('validates UUIDs correctly', () => {
      assert.strictEqual(isValidUUID(paper1.id), true);
      assert.strictEqual(isValidUUID('not-a-uuid'), false);
      assert.strictEqual(isValidUUID(null), false);
      assert.strictEqual(isValidUUID(undefined), false);
      assert.strictEqual(isValidUUID(''), false);
    });

    it('validates assignment payload', () => {
      assert.strictEqual(
        validateCreateAssignment({ paper_id: paper1.id, tag_id: rootTag.id }),
        null
      );
      assert.strictEqual(
        validateCreateAssignment({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
        null
      );
      assert.ok(validateCreateAssignment(null));
      assert.ok(validateCreateAssignment({}));
      assert.ok(validateCreateAssignment({ paper_id: 'bad', tag_id: rootTag.id }));
      assert.ok(validateCreateAssignment({ paper_id: paper1.id, tag_id: 'bad' }));
      assert.ok(
        validateCreateAssignment({
          paper_id: paper1.id,
          tag_id: rootTag.id,
          annotation_id: 'bad',
        })
      );
    });

    it('parses pagination correctly', () => {
      assert.deepStrictEqual(parsePagination({ limit: '10', offset: '20' }), {
        limit: 10,
        offset: 20,
      });
      assert.deepStrictEqual(parsePagination({}), { limit: 50, offset: 0 });
      assert.ok(parsePagination({ limit: '-5' }).error);
      assert.ok(parsePagination({ limit: '999' }).error);
      assert.ok(parsePagination({ offset: '-1' }).error);
    });
  });

  // ============================================================================
  // SECTION 2: CORE FR-11 TEST REQUIREMENTS (1–14)
  // ============================================================================
  describe('2. Core FR-11 Requirements Coverage (Tests 1–14)', () => {

    // Test 1: Assign a valid tag to a valid section/span
    it('Test 1: Assign a valid tag to a valid section/span (and paper-level)', async () => {
      // 1a. Section-level assignment
      const resSection = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });

      assert.strictEqual(resSection.status, 201);
      const dataSection = await resSection.json();
      assert.strictEqual(dataSection.message, 'Tag assignment created successfully.');
      assert.ok(dataSection.assignment.id);
      assert.strictEqual(dataSection.assignment.paper_id, paper1.id);
      assert.strictEqual(dataSection.assignment.annotation_id, annotation1.id);
      assert.strictEqual(dataSection.assignment.tag_id, childTag1.id);
      assert.strictEqual(dataSection.assignment.assigned_by, researcherUser1.id);

      // 1b. Paper-level assignment (without annotation)
      const resPaper = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });

      assert.strictEqual(resPaper.status, 201);
      const dataPaper = await resPaper.json();
      assert.strictEqual(dataPaper.assignment.paper_id, paper1.id);
      assert.strictEqual(dataPaper.assignment.annotation_id, null);
      assert.strictEqual(dataPaper.assignment.tag_id, rootTag.id);
    });

    // Test 2: Retrieve assignments for a section/span
    it('Test 2: Retrieve assignments for a section/span with canonical paths', async () => {
      // Assign two tags to annotation1
      await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });
      await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag2.id,
          annotation_id: annotation1.id,
        }),
      });

      const res = await fetch(`${baseUrl}/api/paper-tags/section/${annotation1.id}`, {
        method: 'GET',
        headers: authHeaders(studentToken),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.tags));
      assert.strictEqual(data.tags.length, 2);
      assert.strictEqual(data.tags[0].annotation_id, annotation1.id);
      assert.ok(data.tags[0].canonical_path.includes('fr11_energy'));
      assert.ok(data.tags[0].tag_name);
    });

    // Test 3: Retrieve assignments for a paper
    it('Test 3: Retrieve assignments for a paper with pagination', async () => {
      // Assign paper-level tag and section-level tag
      await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });
      await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });

      // 3a. Via RESTful path
      const resPath = await fetch(`${baseUrl}/api/paper-tags/paper/${paper1.id}`, {
        method: 'GET',
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(resPath.status, 200);
      const dataPath = await resPath.json();
      assert.strictEqual(dataPath.total, 2);
      assert.strictEqual(dataPath.assignments.length, 2);

      // 3b. Via query parameter and pagination
      const resQuery = await fetch(
        `${baseUrl}/api/paper-tags?paper_id=${paper1.id}&limit=1&offset=0`,
        {
          method: 'GET',
          headers: authHeaders(studentToken),
        }
      );
      assert.strictEqual(resQuery.status, 200);
      const dataQuery = await resQuery.json();
      assert.strictEqual(dataQuery.total, 2);
      assert.strictEqual(dataQuery.assignments.length, 1);
    });

    // Test 4: Remove an assignment successfully
    it('Test 4: Remove an assignment successfully', async () => {
      const createRes = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });
      const created = await createRes.json();
      const assignmentId = created.assignment.id;

      const deleteRes = await fetch(`${baseUrl}/api/paper-tags/${assignmentId}`, {
        method: 'DELETE',
        headers: authHeaders(researcherToken1),
      });
      assert.strictEqual(deleteRes.status, 200);
      const deleteData = await deleteRes.json();
      assert.strictEqual(deleteData.message, 'Tag assignment removed successfully.');

      // Subsequent GET should return 404
      const getRes = await fetch(`${baseUrl}/api/paper-tags/${assignmentId}`, {
        method: 'GET',
        headers: authHeaders(researcherToken1),
      });
      assert.strictEqual(getRes.status, 404);
    });

    // Test 5: Reject a nonexistent tag
    it('Test 5: Reject a nonexistent tag with 404', async () => {
      const nonexistentTagId = '00000000-0000-4000-8000-000000000999';
      const res = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: nonexistentTagId,
          annotation_id: annotation1.id,
        }),
      });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, 'Topic tag not found.');
    });

    // Test 6: Reject a nonexistent paper or section/span
    it('Test 6: Reject a nonexistent paper or section/span with 404', async () => {
      const nonexistentPaperId = '00000000-0000-4000-8000-000000000888';
      const nonexistentAnnotationId = '00000000-0000-4000-8000-000000000777';

      // 6a. Nonexistent paper
      const resPaper = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: nonexistentPaperId,
          tag_id: rootTag.id,
        }),
      });
      assert.strictEqual(resPaper.status, 404);
      const dataPaper = await resPaper.json();
      assert.strictEqual(dataPaper.error, 'Paper not found.');

      // 6b. Nonexistent annotation
      const resAnnot = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
          annotation_id: nonexistentAnnotationId,
        }),
      });
      assert.strictEqual(resAnnot.status, 404);
      const dataAnnot = await resAnnot.json();
      assert.strictEqual(dataAnnot.error, 'Annotation not found.');
    });

    // Test 7: Reject a section/span that does not belong to the specified paper
    it('Test 7: Reject a section/span that belongs to a different paper with 400', async () => {
      // annotationPaper2 belongs to paper2, but we pass paper1.id
      const res = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
          annotation_id: annotationPaper2.id,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Annotation does not belong to the specified paper.');
    });

    // Test 8: Handle duplicate assignments without duplicate rows
    it('Test 8: Handle duplicate assignments with 409 conflict', async () => {
      // First assignment succeeds
      const res1 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });
      assert.strictEqual(res1.status, 201);

      // Duplicate assignment attempt fails with 409
      const res2 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });
      assert.strictEqual(res2.status, 409);
      const data2 = await res2.json();
      assert.strictEqual(data2.error, 'This tag is already assigned to the specified paper/annotation.');

      // Verify database contains exactly 1 row
      const countRes = await pool.query(
        'SELECT COUNT(*)::int AS count FROM paper_tag_assignments WHERE paper_id = $1 AND tag_id = $2',
        [paper1.id, childTag1.id]
      );
      assert.strictEqual(countRes.rows[0].count, 1);
    });

    // Test 9: Reject malformed IDs and invalid request bodies
    it('Test 9: Reject malformed IDs and invalid request bodies with 400', async () => {
      // Missing paper_id
      const res1 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({ tag_id: rootTag.id }),
      });
      assert.strictEqual(res1.status, 400);

      // Malformed UUID
      const res2 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({ paper_id: 'not-a-valid-uuid', tag_id: rootTag.id }),
      });
      assert.strictEqual(res2.status, 400);

      // Invalid GET param
      const res3 = await fetch(`${baseUrl}/api/paper-tags/invalid-uuid`, {
        method: 'GET',
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res3.status, 400);
    });

    // Test 10: Reject unauthenticated requests
    it('Test 10: Reject unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    // Test 11: Reject unauthorized users and cross-owner access
    it('Test 11: Reject unauthorized roles (STUDENT) and cross-owner deletion', async () => {
      // 11a. Student cannot create assignments (403)
      const resStudent = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(studentToken),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });
      assert.strictEqual(resStudent.status, 403);

      // 11b. Researcher 1 creates an assignment
      const createRes = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });
      assert.strictEqual(createRes.status, 201);
      const assignmentId = (await createRes.json()).assignment.id;

      // 11c. Researcher 2 cannot delete Researcher 1's assignment (403 cross-owner)
      const resCrossOwner = await fetch(`${baseUrl}/api/paper-tags/${assignmentId}`, {
        method: 'DELETE',
        headers: authHeaders(researcherToken2),
      });
      assert.strictEqual(resCrossOwner.status, 403);
      const crossData = await resCrossOwner.json();
      assert.strictEqual(crossData.error, 'Forbidden. You can only remove assignments you created.');

      // 11d. Admin CAN delete Researcher 1's assignment (200)
      const resAdmin = await fetch(`${baseUrl}/api/paper-tags/${assignmentId}`, {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      });
      assert.strictEqual(resAdmin.status, 200);
    });

    // Test 12: Confirm removing an assignment does not delete the original tag or paper
    it('Test 12: Confirm removing an assignment does not delete original tag or paper', async () => {
      const createRes = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: rootTag.id,
        }),
      });
      const assignmentId = (await createRes.json()).assignment.id;

      // Remove assignment
      await fetch(`${baseUrl}/api/paper-tags/${assignmentId}`, {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      });

      // Verify paper still exists in database
      const paperCheck = await pool.query('SELECT id FROM papers WHERE id = $1', [paper1.id]);
      assert.strictEqual(paperCheck.rows.length, 1, 'Paper must still exist');

      // Verify tag still exists in database
      const tagCheck = await pool.query('SELECT id FROM topic_tags WHERE id = $1', [rootTag.id]);
      assert.strictEqual(tagCheck.rows.length, 1, 'Topic tag must still exist');
    });

    // Test 13: Verify relevant foreign-key and uniqueness constraints
    it('Test 13: Verify DB foreign-key RESTRICT on tag deletion and CASCADE on paper deletion', async () => {
      // Create assignment
      await pool.query(
        'INSERT INTO paper_tag_assignments (paper_id, tag_id, assigned_by) VALUES ($1, $2, $3)',
        [paper1.id, childTag2.id, researcherUser1.id]
      );

      // Attempting to delete childTag2 directly from DB must fail due to ON DELETE RESTRICT
      let restrictFailed = false;
      try {
        await pool.query('DELETE FROM topic_tags WHERE id = $1', [childTag2.id]);
      } catch (err) {
        // PostgreSQL RESTRICT violation is SQLSTATE 23001 (or 23503 for general FK violation)
        if (err.code === '23001' || err.code === '23503') restrictFailed = true;
      }
      assert.strictEqual(restrictFailed, true, 'Deleting a tag in use must violate RESTRICT constraint');

      // Direct duplicate INSERT at SQL level must violate uq_paper_annotation_tag
      let uniqueFailed = false;
      try {
        await pool.query(
          'INSERT INTO paper_tag_assignments (paper_id, tag_id, assigned_by) VALUES ($1, $2, $3)',
          [paper1.id, childTag2.id, researcherUser1.id]
        );
      } catch (err) {
        if (err.code === '23505') uniqueFailed = true;
      }
      assert.strictEqual(uniqueFailed, true, 'Duplicate insert must violate UNIQUE constraint');
    });

    // Test 14: Tag reuse across multiple papers and sections
    it('Test 14: Support reusing the same tag across multiple papers and sections', async () => {
      // Assign childTag1 to paper1 annotation1
      const res1 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation1.id,
        }),
      });
      assert.strictEqual(res1.status, 201);

      // Assign the same childTag1 to paper1 annotation2
      const res2 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken1),
        body: JSON.stringify({
          paper_id: paper1.id,
          tag_id: childTag1.id,
          annotation_id: annotation2.id,
        }),
      });
      assert.strictEqual(res2.status, 201);

      // Assign the same childTag1 to paper2 (paper-level)
      const res3 = await fetch(`${baseUrl}/api/paper-tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken2),
        body: JSON.stringify({
          paper_id: paper2.id,
          tag_id: childTag1.id,
        }),
      });
      assert.strictEqual(res3.status, 201);

      // Query papers by tag
      const resByTag = await fetch(`${baseUrl}/api/paper-tags/by-tag/${childTag1.id}`, {
        method: 'GET',
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(resByTag.status, 200);
      const dataByTag = await resByTag.json();
      assert.strictEqual(dataByTag.papers.length, 2, 'Tag is reused across both paper1 and paper2');
    });
  });
});
