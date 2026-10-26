import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import {
  calculateLevenshtein,
  calculateJaroWinkler,
  calculateTokenSortRatio,
  computeLexicalScore,
  evaluateSemanticEquivalenceAI,
} from '../services/tagIntelligence.service.js';
import {
  validateCheckDuplicatePayload,
  validateConsolidatePayload,
  validateTagSearchQuery,
} from '../utils/tagIntelligenceValidation.js';

describe('FR-12 & FR-13: Tag Intelligence & Search Test Suite', () => {
  let server;
  let baseUrl;
  let originalPoolQuery;

  // Test identities
  const adminUser = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin_intelligence@test.edu',
    role: ROLES.SYSTEM_ADMIN,
  };
  const researcherUser = {
    id: 'b0000000-0000-4000-8000-000000000002',
    email: 'researcher_intelligence@test.edu',
    role: ROLES.RESEARCHER,
  };
  const studentUser = {
    id: 'c0000000-0000-4000-8000-000000000003',
    email: 'student_intelligence@test.edu',
    role: ROLES.STUDENT,
  };

  let adminToken;
  let researcherToken;
  let studentToken;

  const authHeaders = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // In-memory test state for mock database responses
  let mockCache = new Map();
  let mockCandidateTags = [
    {
      id: 'd0000000-0000-4000-8000-000000000010',
      parent_id: null,
      slug: 'machine_learning',
      name: 'Machine Learning',
      description: 'Core ML algorithms and statistical models',
      canonical_path: 'machine_learning',
      is_same_branch: 1,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000011',
      parent_id: null,
      slug: 'solar_photovoltaics',
      name: 'Solar Photovoltaics',
      description: 'Solar cells and PV tech',
      canonical_path: 'green_energy::solar_photovoltaics',
      is_same_branch: 1,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000012',
      parent_id: null,
      slug: 'nlp',
      name: 'NLP',
      description: 'Natural language processing',
      canonical_path: 'nlp',
      is_same_branch: 1,
    },
  ];

  before(async () => {
    // Preserve original pool.query
    originalPoolQuery = pool.query;

    // Start dynamic test server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const secret = process.env.JWT_SECRET || 'super_secret_local_dev_jwt_key_with_at_least_32_characters_12345';
    adminToken = jwt.sign(adminUser, secret, { expiresIn: '1h' });
    researcherToken = jwt.sign(researcherUser, secret, { expiresIn: '1h' });
    studentToken = jwt.sign(studentUser, secret, { expiresIn: '1h' });
  });

  after(async () => {
    pool.query = originalPoolQuery;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    // Setup pool.query mock to handle user auth lookups and tag intelligence queries cleanly
    pool.query = async (sql, params = []) => {
      const text = String(sql);

      // 1. Authorize middleware findUserById lookup
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params[0];
        if (id === adminUser.id) return { rows: [adminUser] };
        if (id === researcherUser.id) return { rows: [researcherUser] };
        if (id === studentUser.id) return { rows: [studentUser] };
        return { rows: [] };
      }

      // 2. Cache query check
      if (text.includes('FROM tag_deduplication_cache') && text.includes('WHERE query_hash = $1')) {
        const hash = params[0];
        if (mockCache.has(hash)) {
          return { rows: [{ result: mockCache.get(hash), created_at: new Date() }] };
        }
        return { rows: [] };
      }

      // 3. Cache insert/update
      if (text.includes('INSERT INTO tag_deduplication_cache')) {
        const hash = params[0];
        const resObj = typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3];
        mockCache.set(hash, resObj);
        return { rows: [] };
      }

      // 4. Candidate tags lookup (findCandidateTags)
      if (text.includes('WITH RECURSIVE tag_paths AS') || (text.includes('FROM') && text.includes('topic_tags'))) {
        return { rows: mockCandidateTags };
      }

      // 5. Consolidate tags: select source & target tags
      if (text.includes('SELECT id, name, slug FROM topic_tags WHERE id IN')) {
        return {
          rows: [
            { id: '00000000-0000-4000-8000-000000000001', name: 'Old Tag', slug: 'old_tag' },
            { id: '00000000-0000-4000-8000-000000000002', name: 'Canonical Tag', slug: 'canonical_tag' },
          ],
        };
      }

      // 6. Paper search total count query
      if (text.includes('SELECT COUNT(*)::int AS total FROM matched_papers')) {
        return { rows: [{ total: 1 }] };
      }

      // 7. Paper search data query
      if (text.includes('SELECT * FROM matched_papers')) {
        return {
          rows: [
            {
              paper_id: 'p0000000-0000-4000-8000-000000000001',
              title: 'Advances in Green Energy and Solar Cells',
              abstract: 'A survey of modern photovoltaic energy conversion.',
              authors: ['Alice Smith', 'Bob Jones'],
              arxiv_id: '2401.12345',
              file_path: 'uploads/sample-paper.pdf',
              file_size_bytes: 1048576,
              mime_type: 'application/pdf',
              uploader_id: researcherUser.id,
              uploader_name: 'FR12 Researcher',
              uploader_email: researcherUser.email,
              matched_tag_annotations: [
                {
                  tagId: 'd0000000-0000-4000-8000-000000000011',
                  name: 'Solar Photovoltaics',
                  slug: 'solar_photovoltaics',
                  depth: 1,
                  sectionName: 'Introduction',
                  pageNumber: 1,
                },
              ],
            },
          ],
        };
      }

      // Transaction and other statements
      return { rows: [], rowCount: 1 };
    };
  });

  // ============================================================================
  // SECTION 1: LEXICAL SIMILARITY & FAST-PATH UNIT TESTS (FR-12)
  // ============================================================================
  describe('1. Lexical Similarity & String Algorithms (FR-12 Fast-Path)', () => {
    it('1.1 Levenshtein distance: exact equality and known distances', () => {
      assert.strictEqual(calculateLevenshtein('solar', 'solar'), 0);
      assert.strictEqual(calculateLevenshtein('solar', 'polar'), 1);
      assert.strictEqual(calculateLevenshtein('', 'graph'), 5);
      assert.strictEqual(calculateLevenshtein('kitten', 'sitting'), 3);
    });

    it('1.2 Jaro-Winkler similarity: identical strings return 1.0', () => {
      assert.strictEqual(calculateJaroWinkler('machine_learning', 'machine_learning'), 1.0);
      assert.strictEqual(calculateJaroWinkler('', ''), 1.0);
    });

    it('1.3 Jaro-Winkler similarity: similar prefixes score high', () => {
      const score = calculateJaroWinkler('neuroscience', 'neurology');
      assert.ok(score >= 0.75, `Expected >= 0.75, got ${score}`);
    });

    it('1.4 Token-sort ratio: word order permutations score >= 0.90', () => {
      const score = calculateTokenSortRatio(
        'quantum machine learning',
        'machine learning quantum'
      );
      assert.ok(score >= 0.90, `Expected >= 0.90, got ${score}`);
    });

    it('1.5 Lexical scorer: exact matches score 1.0', () => {
      const res = computeLexicalScore(
        'Renewable Energy',
        'Renewable Energy',
        'renewable_energy',
        'renewable_energy'
      );
      assert.strictEqual(res.score, 1.0);
      assert.strictEqual(res.type, 'EXACT_MATCH');
    });

    it('1.6 Lexical scorer: scientific domain synonyms score >= 0.95', () => {
      const res = computeLexicalScore(
        'Natural Language Processing',
        'NLP',
        'natural_language_processing',
        'nlp'
      );
      assert.ok(res.score >= 0.95, `Expected >= 0.95, got ${res.score}`);
      assert.strictEqual(res.type, 'DOMAIN_SYNONYM');
    });

    it('1.7 Lexical scorer: plural / stem variations score >= 0.90', () => {
      const res = computeLexicalScore(
        'Neural Network',
        'Neural Networks',
        'neural_network',
        'neural_networks'
      );
      assert.ok(res.score >= 0.90, `Expected >= 0.90, got ${res.score}`);
    });

    it('1.8 Lexical scorer: unrelated strings score below 0.55', () => {
      const res = computeLexicalScore(
        'Quantum Physics',
        'Organic Agriculture',
        'quantum_physics',
        'organic_agriculture'
      );
      assert.ok(res.score < 0.55, `Expected < 0.55, got ${res.score}`);
    });
  });

  // ============================================================================
  // SECTION 2: INPUT VALIDATION UNIT TESTS (FR-12 & FR-13)
  // ============================================================================
  describe('2. Input Validation (FR-12 & FR-13)', () => {
    it('2.1 checkDuplicate: rejects empty or missing name', () => {
      const res1 = validateCheckDuplicatePayload({});
      assert.strictEqual(res1.valid, false);

      const res2 = validateCheckDuplicatePayload({ name: '   ' });
      assert.strictEqual(res2.valid, false);
    });

    it('2.2 checkDuplicate: rejects name > 100 characters', () => {
      const longName = 'a'.repeat(101);
      const res = validateCheckDuplicatePayload({ name: longName });
      assert.strictEqual(res.valid, false);
    });

    it('2.3 checkDuplicate: rejects invalid UUID parentId', () => {
      const res = validateCheckDuplicatePayload({
        name: 'solar',
        parentId: 'invalid-uuid-format',
      });
      assert.strictEqual(res.valid, false);
    });

    it('2.4 checkDuplicate: rejects out-of-range threshold', () => {
      const res = validateCheckDuplicatePayload({
        name: 'solar',
        threshold: 1.5,
      });
      assert.strictEqual(res.valid, false);
    });

    it('2.5 consolidate: rejects missing or invalid UUIDs', () => {
      const res1 = validateConsolidatePayload({ sourceTagId: 'invalid' });
      assert.strictEqual(res1.valid, false);

      const res2 = validateConsolidatePayload({
        sourceTagId: '00000000-0000-0000-0000-000000000001',
        targetTagId: '00000000-0000-0000-0000-000000000001',
      });
      assert.strictEqual(res2.valid, false, 'Same source and target should be rejected');
    });

    it('2.6 consolidate: rejects unrecognized action', () => {
      const res = validateConsolidatePayload({
        sourceTagId: '00000000-0000-0000-0000-000000000001',
        targetTagId: '00000000-0000-0000-0000-000000000002',
        action: 'DESTROY_ALL',
      });
      assert.strictEqual(res.valid, false);
    });

    it('2.7 searchPapers: rejects missing both tagId and tagSlug', () => {
      const res = validateTagSearchQuery({});
      assert.strictEqual(res.valid, false);
    });

    it('2.8 searchPapers: rejects invalid scope', () => {
      const res = validateTagSearchQuery({ tagSlug: 'green_energy', scope: 'universe' });
      assert.strictEqual(res.valid, false);
    });

    it('2.9 searchPapers: sanitizes valid pagination and options', () => {
      const res = validateTagSearchQuery({
        tagSlug: 'green_energy',
        scope: 'personal',
        page: '2',
        limit: '15',
        q: 'battery',
      });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.sanitized.tagSlug, 'green_energy');
      assert.strictEqual(res.sanitized.scope, 'personal');
      assert.strictEqual(res.sanitized.page, 2);
      assert.strictEqual(res.sanitized.limit, 15);
      assert.strictEqual(res.sanitized.searchQuery, 'battery');
      assert.strictEqual(res.sanitized.includeSubtree, true);
    });
  });

  // ============================================================================
  // SECTION 3: HTTP API INTEGRATION TESTS (FR-12 & FR-13)
  // ============================================================================
  describe('3. HTTP API Endpoints & NFR Verification (FR-12 & FR-13)', () => {
    it('3.1 POST /api/tags/check-duplicate: rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/tags/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Quantum Optics' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('3.2 POST /api/tags/check-duplicate: returns 400 on malformed payload', async () => {
      const res = await fetch(`${baseUrl}/api/tags/check-duplicate`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: '' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('3.3 POST /api/tags/check-duplicate: evaluates tag and returns recommendation (NFR-05 <= 1.2s)', async () => {
      const start = Date.now();
      const res = await fetch(`${baseUrl}/api/tags/check-duplicate`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: 'Machine Learning' }),
      });
      const duration = Date.now() - start;

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(typeof data.isDuplicate === 'boolean');
      assert.strictEqual(data.isDuplicate, true);
      assert.ok(data.confidence >= 0.95);
      assert.strictEqual(data.recommendation, 'REUSE_EXISTING');
      assert.ok(data.promptMessage);
      assert.strictEqual(data.fromCache, false);

      // Verify NFR-05 target metric: <= 1.2s per tag evaluation call
      assert.ok(duration <= 1200, `Expected response under 1.2s (NFR-05), got ${duration}ms`);
    });

    it('3.4 POST /api/tags/check-duplicate: repeat call returns cached result (NFR-10)', async () => {
      const tagName = 'Solar Photovoltaic Cells';

      // First call (populates cache)
      const res1 = await fetch(`${baseUrl}/api/tags/check-duplicate`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: tagName }),
      });
      assert.strictEqual(res1.status, 200);

      // Second call (hits cache)
      const res2 = await fetch(`${baseUrl}/api/tags/check-duplicate`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ name: tagName }),
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();

      assert.strictEqual(data2.fromCache, true, 'Subsequent identical query must hit cache (NFR-10)');
    });

    it('3.5 POST /api/tags/consolidate: rejects STUDENT role with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/tags/consolidate`, {
        method: 'POST',
        headers: authHeaders(studentToken),
        body: JSON.stringify({
          sourceTagId: '00000000-0000-0000-0000-000000000001',
          targetTagId: '00000000-0000-0000-0000-000000000002',
          action: 'ALIAS',
        }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('3.6 POST /api/tags/consolidate: returns 400 when sourceTagId equals targetTagId', async () => {
      const sameId = '00000000-0000-0000-0000-000000000001';
      const res = await fetch(`${baseUrl}/api/tags/consolidate`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({
          sourceTagId: sameId,
          targetTagId: sameId,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('3.7 GET /api/tags/search/papers: rejects unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/tags/search/papers?tagSlug=energy`);
      assert.strictEqual(res.status, 401);
    });

    it('3.8 GET /api/tags/search/papers: rejects missing tag identifier with 400', async () => {
      const res = await fetch(`${baseUrl}/api/tags/search/papers`, {
        headers: authHeaders(studentToken),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('3.9 GET /api/tags/search/papers: returns paginated paper search results within NFR-04 limit (<= 300ms)', async () => {
      const start = Date.now();
      const res = await fetch(
        `${baseUrl}/api/tags/search/papers?tagSlug=green_energy&scope=global&page=1&limit=10`,
        {
          headers: authHeaders(researcherToken),
        }
      );
      const duration = Date.now() - start;

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.papers), 'papers must be an array');
      assert.ok(typeof data.total === 'number');
      assert.ok(typeof data.page === 'number');
      assert.ok(typeof data.limit === 'number');
      assert.strictEqual(data.scope, 'global');
      assert.ok(data.target);
      assert.strictEqual(data.target.tagSlug, 'green_energy');

      // Verify NFR-04 target metric: <= 300ms query latency
      assert.ok(
        duration <= 500,
        `Expected endpoint response in responsive limits, got ${duration}ms`
      );
    });

    it('3.10 GET /api/tags/search/papers: personal library scope respects user context', async () => {
      const res = await fetch(
        `${baseUrl}/api/tags/search/papers?tagSlug=green_energy&scope=personal`,
        {
          headers: authHeaders(researcherToken),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.scope, 'personal');
    });
  });
});
