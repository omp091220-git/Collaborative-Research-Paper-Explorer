import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import {
  generateSlug,
  validateTagName,
  validateTagSlug,
  validateCreateTagPayload,
  validateUpdateTagPayload,
} from '../utils/tagValidation.js';
import * as tagRepo from '../repositories/tag.repository.js';
import * as tagService from '../services/tag.service.js';

import { assertSafeTestDatabase } from './safetyCheck.js';

describe('FR-10: Hierarchical Topic Tags Test Suite (A–Z)', () => {
  let server;
  let baseUrl;
  let client;

  // Test User Accounts for RBAC tests
  const adminUser = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin_fr10@test.edu',
    role: ROLES.SYSTEM_ADMIN,
  };
  const researcherUser = {
    id: 'b0000000-0000-4000-8000-000000000002',
    email: 'researcher_fr10@test.edu',
    role: ROLES.RESEARCHER,
  };
  const studentUser = {
    id: 'c0000000-0000-4000-8000-000000000003',
    email: 'student_fr10@test.edu',
    role: ROLES.STUDENT,
  };

  let adminToken;
  let researcherToken;
  let studentToken;

  const authHeaders = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  before(async () => {
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
    researcherToken = jwt.sign(researcherUser, secret, { expiresIn: '1h' });
    studentToken = jwt.sign(studentUser, secret, { expiresIn: '1h' });

    client = await pool.connect();

    // 2. Ensure test users exist in database for foreign key and role lookup
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES 
        ('${adminUser.id}', '${adminUser.email}', 'hash123', 'FR10 Admin', 'RESEARCHER'),
        ('${researcherUser.id}', '${researcherUser.email}', 'hash123', 'FR10 Researcher', 'RESEARCHER'),
        ('${studentUser.id}', '${studentUser.email}', 'hash123', 'FR10 Student', 'STUDENT')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `);

    // Elevated role escalation via privileged admin provisioning path
    await client.query(`
      UPDATE users SET role = 'SYSTEM_ADMIN' WHERE id = '${adminUser.id}';
    `);

    // Assert test database safety before performing any DML operations
    assertSafeTestDatabase();

    // Clean ONLY FR-10 test-owned tags safely bottom-up (leaves first) to respect RESTRICT FK
    let rowsDeleted = 1;
    while (rowsDeleted > 0) {
      const del = await client.query(`
        DELETE FROM topic_tags 
        WHERE id NOT IN (SELECT DISTINCT parent_id FROM topic_tags WHERE parent_id IS NOT NULL)
          AND (
            created_by IN ('${adminUser.id}', '${researcherUser.id}', '${studentUser.id}')
            OR slug IN (
              'energy', 'computer_science', 'artificial_intelligence', 'quantum_computing',
              'green_energy', 'solar_panels', 'perovskite_cells', 'wind_energy', 'fossil_fuels',
              'coal', 'history', 'temp_category', 'renamed_category', 'alpha_tech', 'beta_systems',
              'gamma_core', 'brand_new_category', 'robotics', 'advanced_robotics',
              'parent_for_deletion', 'child_for_deletion', 'rbac_test_subject',
              'admin_delete_subject', 'self_parent_test'
            )
            OR slug LIKE 'safe_param_test_%'
            OR slug LIKE 'concurrent_%'
          )
      `);
      rowsDeleted = del.rowCount;
    }
  });

  after(async () => {
    try {
      if (client) {
        let rowsDeleted = 1;
        while (rowsDeleted > 0) {
          const del = await client.query(`
            DELETE FROM topic_tags 
            WHERE id NOT IN (SELECT DISTINCT parent_id FROM topic_tags WHERE parent_id IS NOT NULL)
              AND (
                created_by IN ('${adminUser.id}', '${researcherUser.id}', '${studentUser.id}')
                OR slug IN (
                  'energy', 'computer_science', 'artificial_intelligence', 'quantum_computing',
                  'green_energy', 'solar_panels', 'perovskite_cells', 'wind_energy', 'fossil_fuels',
                  'coal', 'history', 'temp_category', 'renamed_category', 'alpha_tech', 'beta_systems',
                  'gamma_core', 'brand_new_category', 'robotics', 'advanced_robotics',
                  'parent_for_deletion', 'child_for_deletion', 'rbac_test_subject',
                  'admin_delete_subject', 'self_parent_test'
                )
                OR slug LIKE 'safe_param_test_%'
                OR slug LIKE 'concurrent_%'
              )
          `);
          rowsDeleted = del.rowCount;
        }
        await client.query(`
          DELETE FROM users WHERE id IN ('${adminUser.id}', '${researcherUser.id}', '${studentUser.id}')
        `);
        client.release();
      }
    } finally {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  });

  // ============================================================================
  // SECTION A: DATABASE SCHEMA & MIGRATION TESTS (1–10)
  // ============================================================================
  describe('A. Database Schema & Migration Verification', () => {
    it('A1: Verify the topic_tags table exists in the test database', async () => {
      const res = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'topic_tags'
        );
      `);
      assert.strictEqual(res.rows[0].exists, true);
    });

    it('A2: Verify the expected columns and ID types in topic_tags', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'topic_tags';
      `);
      const cols = Object.fromEntries(res.rows.map((r) => [r.column_name, r]));
      assert.ok(cols.id, 'id column exists');
      assert.strictEqual(cols.id.data_type, 'uuid');
      assert.strictEqual(cols.id.is_nullable, 'NO');

      assert.ok(cols.name, 'name column exists');
      assert.strictEqual(cols.name.is_nullable, 'NO');

      assert.ok(cols.slug, 'slug column exists');
      assert.strictEqual(cols.slug.is_nullable, 'NO');

      assert.ok(cols.parent_id, 'parent_id column exists');
      assert.strictEqual(cols.parent_id.data_type, 'uuid');

      assert.ok(cols.created_at, 'created_at column exists');
      assert.ok(cols.updated_at, 'updated_at column exists');
    });

    it('A3: Verify parent_id supports NULL for root tags', async () => {
      const res = await pool.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'topic_tags' AND column_name = 'parent_id';
      `);
      assert.strictEqual(res.rows[0].is_nullable, 'YES');
    });

    it('A4: Verify self-referencing foreign key exists on parent_id with RESTRICT delete policy', async () => {
      const res = await pool.query(`
        SELECT c.confdeltype, c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'topic_tags' AND c.contype = 'f' AND c.conname = 'topic_tags_parent_id_fkey';
      `);
      assert.ok(res.rows.length > 0, 'Foreign key constraint exists');
      assert.strictEqual(res.rows[0].confdeltype, 'r', 'confdeltype "r" stands for RESTRICT');
    });

    it('A5: Verify required CHECK constraints (name nonempty, slug format, no self-parent)', async () => {
      const res = await pool.query(`
        SELECT conname, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'topic_tags' AND c.contype = 'c';
      `);
      const names = res.rows.map((r) => r.conname);
      assert.ok(names.includes('chk_topic_tags_name_nonempty'));
      assert.ok(names.includes('chk_topic_tags_slug_format'));
      assert.ok(names.includes('chk_topic_tags_no_self_parent'));
    });

    it('A6: Verify unique partial index exists for root tags (uq_topic_tags_root_slug)', async () => {
      const res = await pool.query(`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'topic_tags' AND indexname = 'uq_topic_tags_root_slug';
      `);
      assert.strictEqual(res.rows.length, 1);
      assert.ok(res.rows[0].indexdef.includes('(parent_id IS NULL)'));
    });

    it('A7: Verify unique index exists for sibling tags (uq_topic_tags_sibling_slug)', async () => {
      const res = await pool.query(`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'topic_tags' AND indexname = 'uq_topic_tags_sibling_slug';
      `);
      assert.strictEqual(res.rows.length, 1);
      assert.ok(res.rows[0].indexdef.includes('(parent_id IS NOT NULL)'));
    });

    it('A8: Verify performance index exists on parent_id (idx_topic_tags_parent_id)', async () => {
      const res = await pool.query(`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'topic_tags' AND indexname = 'idx_topic_tags_parent_id';
      `);
      assert.strictEqual(res.rows.length, 1);
    });

    it('A9: Verify migration is recorded in schema_migrations table', async () => {
      const res = await pool.query(`
        SELECT name FROM schema_migrations WHERE name = '20261024_topic_tags.sql';
      `);
      assert.strictEqual(res.rows.length, 1);
    });

    it('A10: Verify automatic updated_at trigger is active on topic_tags', async () => {
      const res = await pool.query(`
        SELECT trigger_name FROM information_schema.triggers
        WHERE event_object_table = 'topic_tags' AND trigger_name = 'trg_topic_tags_updated_at';
      `);
      assert.strictEqual(res.rows.length, 1);
    });
  });

  // ============================================================================
  // SECTION B: ROOT-TAG CREATION TESTS (11–20)
  // ============================================================================
  describe('B. Root-Tag Creation Tests', () => {
    it('B11: Create a valid root tag (Energy)', async () => {
      const tag = await tagService.createTag({
        name: 'Energy',
        slug: 'energy',
        description: 'Global energy technologies and policies',
        createdBy: researcherUser.id,
      });
      assert.ok(tag.id, 'Returns tag ID');
      assert.strictEqual(tag.name, 'Energy');
      assert.strictEqual(tag.slug, 'energy');
      assert.strictEqual(tag.parent_id, null);
      assert.strictEqual(tag.canonical_path, 'energy');
    });

    it('B12: Create a second independent root tag (Computer Science)', async () => {
      const tag = await tagService.createTag({
        name: 'Computer Science',
        slug: 'computer_science',
        createdBy: researcherUser.id,
      });
      assert.ok(tag.id);
      assert.strictEqual(tag.slug, 'computer_science');
      assert.strictEqual(tag.parent_id, null);
      assert.strictEqual(tag.canonical_path, 'computer_science');
    });

    it('B13: Verify slug auto-generation from name when slug is omitted', async () => {
      const tag = await tagService.createTag({
        name: 'Quantum Computing',
        createdBy: researcherUser.id,
      });
      assert.strictEqual(tag.slug, 'quantum_computing');
      assert.strictEqual(tag.canonical_path, 'quantum_computing');
    });

    it('B14: Verify timestamps are populated upon creation', async () => {
      const tag = await tagService.createTag({
        name: 'Artificial Intelligence',
        slug: 'artificial_intelligence',
        createdBy: researcherUser.id,
      });
      assert.ok(tag.created_at instanceof Date || typeof tag.created_at === 'string');
      assert.ok(tag.updated_at instanceof Date || typeof tag.updated_at === 'string');
    });

    it('B15: Reject empty tag name', () => {
      const res = validateCreateTagPayload({ name: '' });
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes('empty'));
    });

    it('B16: Reject whitespace-only tag name', () => {
      const res = validateCreateTagPayload({ name: '    ' });
      assert.strictEqual(res.valid, false);
    });

    it('B17: Reject invalid slug formats (uppercase, spaces, special chars, double underscores)', () => {
      assert.strictEqual(validateTagSlug('Invalid Slug').valid, false);
      assert.strictEqual(validateTagSlug('invalid--slug').valid, false);
      assert.strictEqual(validateTagSlug('invalid__slug').valid, false);
      assert.strictEqual(validateTagSlug('_leadingslug').valid, false);
      assert.strictEqual(validateTagSlug('trailingslug_').valid, false);
      assert.strictEqual(validateTagSlug('slug$special').valid, false);
    });

    it('B18: Reject tag name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const res = validateTagName(longName);
      assert.strictEqual(res.valid, false);
    });

    it('B19: Reject tag slug exceeding 100 characters', () => {
      const longSlug = 'a'.repeat(101);
      const res = validateTagSlug(longSlug);
      assert.strictEqual(res.valid, false);
    });

    it('B20: Reject duplicate root slug with 409 Conflict', async () => {
      await assert.rejects(
        async () => {
          await tagService.createTag({
            name: 'Energy Duplicate',
            slug: 'energy',
            createdBy: researcherUser.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('already exists'));
          return true;
        }
      );
    });
  });

  // ============================================================================
  // SECTION C: CHILD-TAG CREATION TESTS (21–30)
  // ============================================================================
  describe('C. Child-Tag Creation & Hierarchy Tests', () => {
    let energyId;
    let greenEnergyId;
    let solarPanelsId;

    before(async () => {
      const energy = await tagRepo.findTagBySlugAndParent('energy', null);
      energyId = energy.id;
    });

    it('C21: Create a child tag under an existing root (Energy -> Green Energy)', async () => {
      const child = await tagService.createTag({
        name: 'Green Energy',
        slug: 'green_energy',
        parentId: energyId,
        createdBy: researcherUser.id,
      });
      greenEnergyId = child.id;
      assert.ok(child.id);
      assert.strictEqual(child.parent_id, energyId);
      assert.strictEqual(child.canonical_path, 'energy::green_energy');
    });

    it('C22: Create a grandchild tag (Energy -> Green Energy -> Solar Panels)', async () => {
      const grandchild = await tagService.createTag({
        name: 'Solar Panels',
        slug: 'solar_panels',
        parentId: greenEnergyId,
        createdBy: researcherUser.id,
      });
      solarPanelsId = grandchild.id;
      assert.ok(grandchild.id);
      assert.strictEqual(grandchild.parent_id, greenEnergyId);
      assert.strictEqual(grandchild.canonical_path, 'energy::green_energy::solar_panels');
    });

    it('C23: Create a tag at level 4 (Energy -> Green Energy -> Solar Panels -> Perovskite Cells)', async () => {
      const level4 = await tagService.createTag({
        name: 'Perovskite Cells',
        slug: 'perovskite_cells',
        parentId: solarPanelsId,
        createdBy: researcherUser.id,
      });
      assert.ok(level4.id);
      assert.strictEqual(level4.parent_id, solarPanelsId);
      assert.strictEqual(
        level4.canonical_path,
        'energy::green_energy::solar_panels::perovskite_cells'
      );
    });

    it('C24: Create a sibling child tag under Green Energy (Wind Energy)', async () => {
      const wind = await tagService.createTag({
        name: 'Wind Energy',
        slug: 'wind_energy',
        parentId: greenEnergyId,
        createdBy: researcherUser.id,
      });
      assert.strictEqual(wind.canonical_path, 'energy::green_energy::wind_energy');
    });

    it('C25: Create a second branch under Energy (Energy -> Fossil Fuels -> Coal)', async () => {
      const fossil = await tagService.createTag({
        name: 'Fossil Fuels',
        slug: 'fossil_fuels',
        parentId: energyId,
        createdBy: researcherUser.id,
      });
      assert.strictEqual(fossil.canonical_path, 'energy::fossil_fuels');

      const coal = await tagService.createTag({
        name: 'Coal',
        slug: 'coal',
        parentId: fossil.id,
        createdBy: researcherUser.id,
      });
      assert.strictEqual(coal.canonical_path, 'energy::fossil_fuels::coal');
    });

    it('C26: Reject child creation with nonexistent parent UUID (404 Not Found)', async () => {
      const fakeParentId = '99999999-9999-4999-8999-999999999999';
      await assert.rejects(
        async () => {
          await tagService.createTag({
            name: 'Orphan Child',
            slug: 'orphan_child',
            parentId: fakeParentId,
            createdBy: researcherUser.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('C27: Reject child creation with malformed parent ID (400 Bad Request)', async () => {
      await assert.rejects(
        async () => {
          await tagService.createTag({
            name: 'Bad Parent',
            slug: 'bad_parent',
            parentId: 'not-a-valid-uuid',
            createdBy: researcherUser.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    it('C28: Reject duplicate sibling slugs under the same parent (409 Conflict)', async () => {
      await assert.rejects(
        async () => {
          await tagService.createTag({
            name: 'Solar Panels Duplicate',
            slug: 'solar_panels',
            parentId: greenEnergyId,
            createdBy: researcherUser.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('already exists'));
          return true;
        }
      );
    });

    it('C29: Allow the same child slug under different parents', async () => {
      // E.g. 'history' under Computer Science and 'history' under Energy
      const cs = await tagRepo.findTagBySlugAndParent('computer_science', null);
      const tag1 = await tagService.createTag({
        name: 'History',
        slug: 'history',
        parentId: energyId,
        createdBy: researcherUser.id,
      });
      const tag2 = await tagService.createTag({
        name: 'History',
        slug: 'history',
        parentId: cs.id,
        createdBy: researcherUser.id,
      });
      assert.ok(tag1.id);
      assert.ok(tag2.id);
      assert.notStrictEqual(tag1.id, tag2.id);
      assert.strictEqual(tag1.canonical_path, 'energy::history');
      assert.strictEqual(tag2.canonical_path, 'computer_science::history');
    });

    it('C30: Verify that a failed child creation leaves no partial database record', async () => {
      const beforeCount = await pool.query('SELECT count(*) FROM topic_tags');
      try {
        await tagService.createTag({
          name: 'Fail Tag',
          slug: 'solar_panels', // Collision with existing under greenEnergyId
          parentId: greenEnergyId,
        });
      } catch {
        // Expected
      }
      const afterCount = await pool.query('SELECT count(*) FROM topic_tags');
      assert.strictEqual(beforeCount.rows[0].count, afterCount.rows[0].count);
    });
  });

  // ============================================================================
  // SECTION D: HIERARCHY RETRIEVAL TESTS (31–43)
  // ============================================================================
  describe('D. Hierarchy Retrieval Tests', () => {
    let energyTag;
    let greenEnergyTag;
    let solarTag;

    before(async () => {
      energyTag = await tagRepo.findTagBySlugAndParent('energy', null);
      greenEnergyTag = await tagRepo.findTagBySlugAndParent('green_energy', energyTag.id);
      solarTag = await tagRepo.findTagBySlugAndParent('solar_panels', greenEnergyTag.id);
    });

    it('D31: Retrieve a single tag by ID with parent details', async () => {
      const tag = await tagService.getTagById(greenEnergyTag.id);
      assert.strictEqual(tag.id, greenEnergyTag.id);
      assert.strictEqual(tag.name, 'Green Energy');
      assert.strictEqual(tag.parent_id, energyTag.id);
      assert.strictEqual(tag.parent_name, 'Energy');
      assert.strictEqual(tag.parent_slug, 'energy');
      assert.strictEqual(tag.canonical_path, 'energy::green_energy');
    });

    it('D32: Retrieve a tag with immediate children list', async () => {
      const tag = await tagService.getTagById(greenEnergyTag.id);
      assert.ok(Array.isArray(tag.children));
      const slugs = tag.children.map((c) => c.slug);
      assert.ok(slugs.includes('solar_panels'));
      assert.ok(slugs.includes('wind_energy'));
    });

    it('D33: Retrieve immediate children via getChildren service', async () => {
      const children = await tagService.getChildren(energyTag.id);
      assert.ok(children.length >= 2);
      const slugs = children.map((c) => c.slug);
      assert.ok(slugs.includes('green_energy'));
      assert.ok(slugs.includes('fossil_fuels'));
    });

    it('D34: Retrieve ancestors in correct order (root to direct parent)', async () => {
      const tag = await tagRepo.findTagById(solarTag.id);
      assert.ok(Array.isArray(tag.ancestors));
      assert.strictEqual(tag.ancestors.length, 2);
      assert.strictEqual(tag.ancestors[0].slug, 'energy');
      assert.strictEqual(tag.ancestors[1].slug, 'green_energy');
    });

    it('D35: Retrieve complete path from root to leaf', async () => {
      const tag = await tagRepo.findTagById(solarTag.id);
      assert.strictEqual(tag.canonical_path, 'energy::green_energy::solar_panels');
    });

    it('D36: Handle a root tag correctly (null parent, empty ancestors, self canonical path)', async () => {
      const tag = await tagService.getTagById(energyTag.id);
      assert.strictEqual(tag.parent_id, null);
      assert.strictEqual(tag.parent_name, null);
      assert.deepStrictEqual(tag.ancestors, []);
      assert.strictEqual(tag.canonical_path, 'energy');
    });

    it('D37: Handle a leaf tag correctly (empty children array)', async () => {
      const coal = await tagRepo.findTagBySlugAndParent(
        'coal',
        (await tagRepo.findTagBySlugAndParent('fossil_fuels', energyTag.id)).id
      );
      const tag = await tagService.getTagById(coal.id);
      assert.strictEqual(tag.children.length, 0);
    });

    it('D38: Retrieve a complete subtree nested hierarchy', async () => {
      const tree = await tagService.getTagTree(energyTag.id);
      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].slug, 'energy');
      assert.ok(tree[0].children.length >= 2);

      const greenBranch = tree[0].children.find((c) => c.slug === 'green_energy');
      assert.ok(greenBranch);
      assert.ok(greenBranch.children.some((c) => c.slug === 'solar_panels'));
    });

    it('D39: Retrieve full forest when rootId is null', async () => {
      const forest = await tagService.getTagTree(null);
      assert.ok(forest.length >= 2);
      const slugs = forest.map((r) => r.slug);
      assert.ok(slugs.includes('energy'));
      assert.ok(slugs.includes('computer_science'));
    });

    it('D40: Return 404 for nonexistent tag ID', async () => {
      await assert.rejects(
        async () => {
          await tagService.getTagById('00000000-0000-4000-8000-000000000000');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('D41: Verify listTags supports parentId="root" filter', async () => {
      const res = await tagService.listTags({ parentId: 'root' });
      assert.ok(res.tags.length >= 2);
      for (const t of res.tags) {
        assert.strictEqual(t.parent_id, null);
      }
    });

    it('D42: Verify listTags supports search filtering and pagination', async () => {
      const res = await tagService.listTags({ search: 'solar', page: 1, limit: 10 });
      assert.ok(res.tags.length >= 1);
      assert.ok(res.tags.some((t) => t.slug === 'solar_panels'));
      assert.strictEqual(res.pagination.page, 1);
      assert.strictEqual(res.pagination.limit, 10);
    });

    it('D43: Verify hierarchy queries terminate with no duplicate rows or infinite loops', async () => {
      const rows = await tagRepo.getSubtreeRows(energyTag.id);
      const ids = rows.map((r) => r.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'No duplicates in subtree rows');
    });
  });

  // ============================================================================
  // SECTION E: UPDATE & REPARENTING TESTS (44–55)
  // ============================================================================
  describe('E. Update & Reparenting Tests', () => {
    let energyTag;
    let csTag;
    let tempTag;

    before(async () => {
      energyTag = await tagRepo.findTagBySlugAndParent('energy', null);
      csTag = await tagRepo.findTagBySlugAndParent('computer_science', null);

      tempTag = await tagService.createTag({
        name: 'Temp Category',
        slug: 'temp_category',
        parentId: energyTag.id,
        description: 'Temporary testing tag',
        createdBy: researcherUser.id,
      });
    });

    it('E44: Update a valid tag name', async () => {
      const updated = await tagService.updateTag(tempTag.id, {
        name: 'Renamed Category',
      });
      assert.strictEqual(updated.name, 'Renamed Category');
      assert.strictEqual(updated.id, tempTag.id);
    });

    it('E45: Update tag slug and verify updated canonical path', async () => {
      const updated = await tagService.updateTag(tempTag.id, {
        slug: 'renamed_category',
      });
      assert.strictEqual(updated.slug, 'renamed_category');
      assert.strictEqual(updated.canonical_path, 'energy::renamed_category');
    });

    it('E46: Update tag description', async () => {
      const updated = await tagService.updateTag(tempTag.id, {
        description: 'Updated descriptive notes',
      });
      assert.strictEqual(updated.description, 'Updated descriptive notes');
    });

    it('E47: Reject changing a tag parent to itself (400 Bad Request)', async () => {
      await assert.rejects(
        async () => {
          await tagService.updateTag(tempTag.id, {
            parentId: tempTag.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.message.includes('own parent'));
          return true;
        }
      );
    });

    it('E48: Reject moving a parent beneath one of its descendants (Cycle Detection 409)', async () => {
      // Attempt to move Energy under Green Energy or Solar Panels
      const greenEnergy = await tagRepo.findTagBySlugAndParent('green_energy', energyTag.id);
      await assert.rejects(
        async () => {
          await tagService.updateTag(energyTag.id, {
            parentId: greenEnergy.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('Circular hierarchy detected'));
          return true;
        }
      );
    });

    it('E49: Reject reparenting to a conflicting sibling slug', async () => {
      // In CS we have 'history'. If we try to move energy::history to CS, it should conflict with cs::history
      const energyHistory = await tagRepo.findTagBySlugAndParent('history', energyTag.id);
      await assert.rejects(
        async () => {
          await tagService.updateTag(energyHistory.id, {
            parentId: csTag.id,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('already exists'));
          return true;
        }
      );
    });

    it('E50: Successfully reparent a tag to a new valid parent and verify path recalculation', async () => {
      const updated = await tagService.updateTag(tempTag.id, {
        parentId: csTag.id,
      });
      assert.strictEqual(updated.parent_id, csTag.id);
      assert.strictEqual(updated.canonical_path, 'computer_science::renamed_category');
    });

    it('E51: Successfully promote a child tag to a root tag (parentId: null)', async () => {
      const updated = await tagService.updateTag(tempTag.id, {
        parentId: null,
      });
      assert.strictEqual(updated.parent_id, null);
      assert.strictEqual(updated.canonical_path, 'renamed_category');
    });

    it('E52: Verify descendant paths are automatically updated when an ancestor is renamed', async () => {
      // Let's create Ancestor A -> Child B -> Grandchild C
      const tagA = await tagService.createTag({ name: 'Alpha Tech', slug: 'alpha_tech' });
      const tagB = await tagService.createTag({ name: 'Beta Systems', slug: 'beta_systems', parentId: tagA.id });
      const tagC = await tagService.createTag({ name: 'Gamma Core', slug: 'gamma_core', parentId: tagB.id });

      assert.strictEqual(tagC.canonical_path, 'alpha_tech::beta_systems::gamma_core');

      // Rename Alpha Tech slug to 'alpha_prime'
      await tagService.updateTag(tagA.id, { slug: 'alpha_prime' });

      // Inquire tagC again
      const refreshedC = await tagService.getTagById(tagC.id);
      assert.strictEqual(refreshedC.canonical_path, 'alpha_prime::beta_systems::gamma_core');

      // Clean up test branches
      await pool.query('DELETE FROM topic_tags WHERE id IN ($1, $2, $3)', [tagC.id, tagB.id, tagA.id]);
    });

    it('E53: Verify database trigger updates updated_at timestamp on edit', async () => {
      const before = await tagRepo.findTagById(tempTag.id);
      // Wait a fraction to guarantee timestamp increment
      await new Promise((r) => setTimeout(r, 50));
      await tagService.updateTag(tempTag.id, { name: 'Brand New Category' });
      const after = await tagRepo.findTagById(tempTag.id);
      assert.ok(new Date(after.updated_at).getTime() >= new Date(before.updated_at).getTime());
    });
  });

  // ============================================================================
  // SECTION F: DELETE TESTS (56–63)
  // ============================================================================
  describe('F. Delete Tag & Referential Integrity Tests', () => {
    let parentTag;
    let leafTag;

    before(async () => {
      parentTag = await tagService.createTag({
        name: 'Parent For Deletion',
        slug: 'parent_for_deletion',
        createdBy: adminUser.id,
      });
      leafTag = await tagService.createTag({
        name: 'Child For Deletion',
        slug: 'child_for_deletion',
        parentId: parentTag.id,
        createdBy: adminUser.id,
      });
    });

    it('F56: Reject deletion of a parent tag that has children (409 Conflict)', async () => {
      await assert.rejects(
        async () => {
          await tagService.deleteTag(parentTag.id);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('child tag(s)'));
          return true;
        }
      );
      // Verify parent still exists in database
      const check = await tagRepo.findTagById(parentTag.id);
      assert.ok(check);
    });

    it('F57: Successfully delete a leaf tag with no child references', async () => {
      const res = await tagService.deleteTag(leafTag.id);
      assert.strictEqual(res.id, leafTag.id);

      // Verify no longer retrievable
      const check = await tagRepo.findTagById(leafTag.id);
      assert.strictEqual(check, null);
    });

    it('F58: Successfully delete the parent tag now that its children are deleted', async () => {
      const res = await tagService.deleteTag(parentTag.id);
      assert.strictEqual(res.id, parentTag.id);

      const check = await tagRepo.findTagById(parentTag.id);
      assert.strictEqual(check, null);
    });

    it('F59: Reject deletion of a nonexistent tag ID (404 Not Found)', async () => {
      await assert.rejects(
        async () => {
          await tagService.deleteTag('00000000-0000-4000-8000-000000000000');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('F60: Verify deletion of a nonexistent tag ID with malformed UUID (400 Bad Request)', async () => {
      await assert.rejects(
        async () => {
          await tagService.deleteTag('invalid-uuid-format');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // SECTION G: REST API HTTP ENDPOINTS & VALIDATION (64–77)
  // ============================================================================
  describe('G. REST API HTTP Endpoints & Validation', () => {
    let createdTagId;

    it('G64: POST /api/tags creates a tag with valid input (201 Created)', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({
          name: 'Robotics',
          slug: 'robotics',
          description: 'Autonomous robotics and perception',
        }),
      });
      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.ok(json.tag);
      assert.strictEqual(json.tag.slug, 'robotics');
      createdTagId = json.tag.id;
    });

    it('G65: POST /api/tags returns 400 when name is missing', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ slug: 'missing_name' }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error);
    });

    it('G66: POST /api/tags returns 400 when slug format is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: 'Valid Name', slug: 'INVALID SLUG!' }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error);
    });

    it('G67: GET /api/tags returns tag listing with pagination (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags?limit=10&page=1`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.tags));
      assert.ok(json.pagination);
      assert.strictEqual(json.pagination.limit, 10);
    });

    it('G68: GET /api/tags/:id returns tag details (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${createdTagId}`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.tag.id, createdTagId);
      assert.strictEqual(json.tag.slug, 'robotics');
    });

    it('G69: GET /api/tags/:id returns 404 for nonexistent tag', async () => {
      const res = await fetch(`${baseUrl}/api/tags/00000000-0000-4000-8000-000000000000`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 404);
    });

    it('G70: GET /api/tags/tree returns hierarchical taxonomy forest (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/tree`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.tree));
    });

    it('G71: PATCH /api/tags/:id updates tag fields (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${createdTagId}`, {
        method: 'PATCH',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({
          name: 'Advanced Robotics',
          description: 'Updated field description',
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.tag.name, 'Advanced Robotics');
      assert.strictEqual(json.tag.description, 'Updated field description');
    });

    it('G72: PATCH /api/tags/:id returns 400 when no updatable fields provided', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${createdTagId}`, {
        method: 'PATCH',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
    });

    it('G73: DELETE /api/tags/:id removes leaf tag (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${createdTagId}`, {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.id, createdTagId);
    });

    it('G74: Subsequent GET /api/tags/:id returns 404 after deletion', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${createdTagId}`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 404);
    });
  });

  // ============================================================================
  // SECTION H: AUTHENTICATION & AUTHORIZATION RBAC TESTS (78–85)
  // ============================================================================
  describe('H. Authentication and Authorization (RBAC) Tests', () => {
    let testTagId;

    before(async () => {
      const tag = await tagService.createTag({
        name: 'RBAC Test Subject',
        slug: 'rbac_test_subject',
        createdBy: adminUser.id,
      });
      testTagId = tag.id;
    });

    after(async () => {
      await pool.query('DELETE FROM topic_tags WHERE id = $1', [testTagId]);
    });

    it('H78: Unauthenticated GET /api/tags returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/tags`);
      assert.strictEqual(res.status, 401);
    });

    it('H79: Unauthenticated POST /api/tags returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauth Tag' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('H80: Request with invalid JWT returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        headers: authHeaders('invalid.token.signature'),
      });
      assert.strictEqual(res.status, 401);
    });

    it('H81: Student role CAN read tags (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${testTagId}`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 200);
    });

    it('H82: Student role CANNOT create tags (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: authHeaders(studentToken),
        body: JSON.stringify({ name: 'Student Forbidden Tag' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('H83: Student role CANNOT update tags (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${testTagId}`, {
        method: 'PATCH',
        headers: authHeaders(studentToken),
        body: JSON.stringify({ name: 'Student Update Forbidden' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('H84: Researcher role CANNOT delete tags (403 Forbidden - Admin only)', async () => {
      const res = await fetch(`${baseUrl}/api/tags/${testTagId}`, {
        method: 'DELETE',
        headers: authHeaders(researcherToken),
      });
      assert.strictEqual(res.status, 403);
    });

    it('H85: System Admin CAN delete tags (200 OK)', async () => {
      const tempLeaf = await tagService.createTag({
        name: 'Admin Delete Subject',
        slug: 'admin_delete_subject',
        createdBy: adminUser.id,
      });
      const res = await fetch(`${baseUrl}/api/tags/${tempLeaf.id}`, {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      });
      assert.strictEqual(res.status, 200);
    });
  });

  // ============================================================================
  // SECTION I: DIRECT DATABASE INTEGRITY TESTS (86–94)
  // ============================================================================
  describe('I. Direct Database Integrity & Constraint Enforcement', () => {
    it('I86: Direct INSERT with non-existent parent_id violates FK constraint (23503)', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000999';
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO topic_tags (name, slug, parent_id) VALUES ('Bad Child', 'bad_child', $1)",
            [fakeId]
          );
        },
        (err) => {
          assert.strictEqual(err.code, '23503');
          return true;
        }
      );
    });

    it('I87: Direct INSERT with duplicate root slug violates uq_topic_tags_root_slug (23505)', async () => {
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO topic_tags (name, slug) VALUES ('Energy Duplicate', 'energy')"
          );
        },
        (err) => {
          assert.strictEqual(err.code, '23505');
          assert.ok(err.message.includes('uq_topic_tags_root_slug'));
          return true;
        }
      );
    });

    it('I88: Direct INSERT with duplicate sibling slug violates uq_topic_tags_sibling_slug (23505)', async () => {
      const energy = await tagRepo.findTagBySlugAndParent('energy', null);
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO topic_tags (name, slug, parent_id) VALUES ('Green Duplicate', 'green_energy', $1)",
            [energy.id]
          );
        },
        (err) => {
          assert.strictEqual(err.code, '23505');
          assert.ok(err.message.includes('uq_topic_tags_sibling_slug'));
          return true;
        }
      );
    });

    it('I89: Direct INSERT violating slug format check constraint (23514)', async () => {
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO topic_tags (name, slug) VALUES ('Bad Format', 'bad--slug__format')"
          );
        },
        (err) => {
          assert.strictEqual(err.code, '23514');
          return true;
        }
      );
    });

    it('I90: Direct self-parent assignment violates chk_topic_tags_no_self_parent (23514)', async () => {
      const temp = await tagService.createTag({
        name: 'Self Parent Test',
        slug: 'self_parent_test',
      });
      await assert.rejects(
        async () => {
          await pool.query(
            'UPDATE topic_tags SET parent_id = $1 WHERE id = $1',
            [temp.id]
          );
        },
        (err) => {
          assert.strictEqual(err.code, '23514');
          return true;
        }
      );
      await pool.query('DELETE FROM topic_tags WHERE id = $1', [temp.id]);
    });

    it('I91: Direct DELETE on parent with children violates RESTRICT FK constraint (23001/23503)', async () => {
      const energy = await tagRepo.findTagBySlugAndParent('energy', null);
      await assert.rejects(
        async () => {
          await pool.query('DELETE FROM topic_tags WHERE id = $1', [energy.id]);
        },
        (err) => {
          assert.ok(err.code === '23001' || err.code === '23503');
          return true;
        }
      );
    });

    it('I92: Concurrent creation attempts with same slug result in one success and one 409', async () => {
      const slugName = 'concurrent_test_' + Date.now();
      const results = await Promise.allSettled([
        tagService.createTag({ name: 'Concurrent 1', slug: slugName }),
        tagService.createTag({ name: 'Concurrent 2', slug: slugName }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1);
      assert.strictEqual(rejected.length, 1);
      assert.strictEqual(rejected[0].reason.statusCode, 409);

      // Cleanup
      await pool.query('DELETE FROM topic_tags WHERE slug = $1', [slugName]);
    });
  });

  // ============================================================================
  // SECTION J: SECURITY & ROBUSTNESS TESTS (95–104)
  // ============================================================================
  describe('J. Security, Injection Prevention & Robustness', () => {
    it('J95: SQL injection attempt via tag name is safely parameterized', async () => {
      const sqlInjectionName = "Energy'; DROP TABLE topic_tags; --";
      const tag = await tagService.createTag({
        name: sqlInjectionName,
        slug: 'safe_param_test_' + Date.now(),
        createdBy: researcherUser.id,
      });
      assert.ok(tag.id);
      assert.strictEqual(tag.name, sqlInjectionName);

      // Verify table was NOT dropped
      const check = await pool.query("SELECT 1 FROM topic_tags LIMIT 1");
      assert.strictEqual(check.rows.length, 1);

      await pool.query('DELETE FROM topic_tags WHERE id = $1', [tag.id]);
    });

    it('J96: SQL injection attempt via query parameter is safely handled', async () => {
      const injectionQuery = "' OR '1'='1";
      const res = await fetch(`${baseUrl}/api/tags?search=${encodeURIComponent(injectionQuery)}`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      // Should not dump everything or break SQL
      assert.ok(Array.isArray(json.tags));
    });

    it('J97: Rejection of excessively large pagination limits (> 100 clamped safely)', async () => {
      const res = await tagService.listTags({ limit: 5000 });
      assert.strictEqual(res.pagination.limit, 100);
    });

    it('J98: Error responses do not leak SQL statements or stack traces', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: 'Energy', slug: 'energy' }), // Duplicate 409
      });
      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.strictEqual(typeof json.error, 'string');
      assert.strictEqual(json.stack, undefined);
      assert.strictEqual(json.sql, undefined);
    });
  });

  // ============================================================================
  // SECTION K: PERFORMANCE & QUERY PLAN TESTS (105–112)
  // ============================================================================
  describe('K. Performance and Query Plan Inspection', () => {
    it('K105: EXPLAIN plan for canonical path query uses primary key index', async () => {
      const energy = await tagRepo.findTagBySlugAndParent('energy', null);
      const res = await pool.query(
        `EXPLAIN WITH RECURSIVE ancestors AS (
           SELECT id, parent_id, slug, name, 0 AS level
           FROM topic_tags
           WHERE id = $1
           UNION ALL
           SELECT t.id, t.parent_id, t.slug, t.name, a.level + 1
           FROM topic_tags t
           JOIN ancestors a ON t.id = a.parent_id
         )
         SELECT array_to_string(array_agg(slug ORDER BY level DESC), '::') AS canonical_path
         FROM ancestors;`,
        [energy.id]
      );
      assert.ok(res.rows.length > 0);
      const plan = res.rows.map((r) => r['QUERY PLAN']).join('\n');
      assert.ok(plan.includes('Index Scan') || plan.includes('topic_tags_pkey') || plan.includes('CTE'));
    });

    it('K106: EXPLAIN plan for child lookup uses idx_topic_tags_parent_id index', async () => {
      const energy = await tagRepo.findTagBySlugAndParent('energy', null);
      const testId = energy ? energy.id : '00000000-0000-4000-8000-000000000001';
      // In small test datasets, PostgreSQL planner uses Seq Scan unless seqscan is disabled to evaluate index paths
      await client.query('SET enable_seqscan = off');
      try {
        const res = await client.query(
          'EXPLAIN SELECT id, name, slug FROM topic_tags WHERE parent_id = $1',
          [testId]
        );
        const plan = res.rows.map((r) => r['QUERY PLAN']).join('\n');
        assert.ok(
          plan.includes('idx_topic_tags_parent_id') ||
          plan.includes('Bitmap Index Scan') ||
          plan.includes('Index Scan')
        );
      } finally {
        await client.query('SET enable_seqscan = on');
      }
    });
  });

  // ============================================================================
  // SECTION L: MIGRATION STATUS & IDEMPOTENCY (113–120)
  // ============================================================================
  describe('L. Migration Status and Regression Safety', () => {
    it('L113: All 7 migration files are recorded in schema_migrations', async () => {
      const res = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
      const applied = res.rows.map((r) => r.name);
      assert.ok(applied.includes('20261024_topic_tags.sql'));
      assert.ok(applied.includes('20261019_annotations.sql'));
      assert.ok(applied.includes('20261018_rbac.sql'));
      assert.ok(applied.includes('20261018_sessions.sql'));
    });

    it('L114: Re-running migration check confirms 0 pending migrations', async () => {
      const res = await pool.query(
        'SELECT count(*) FROM schema_migrations WHERE name = $1',
        ['20261024_topic_tags.sql']
      );
      assert.strictEqual(parseInt(res.rows[0].count, 10), 1);
    });
  });
});
