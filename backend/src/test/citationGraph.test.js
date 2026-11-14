import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import * as citationService from '../services/citation.service.js';

const TEST_SECRET = process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';
const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const RESEARCHER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

const originalQuery = pool.query;

describe('FR-16: Interactive Citation Graph Test Suite', () => {
  before(() => {
    // Intercept database queries for isolated test runs
    pool.query = async (sql, params) => {
      const text = String(sql);

      // User lookup for authorizeRoles
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const userId = params?.[0];
        if (userId === STUDENT_ID) {
          return { rows: [{ id: STUDENT_ID, role: ROLES.STUDENT, email: 'student@test.edu' }] };
        }
        if (userId === RESEARCHER_ID) {
          return { rows: [{ id: RESEARCHER_ID, role: ROLES.RESEARCHER, email: 'researcher@test.edu' }] };
        }
        if (userId === ADMIN_ID) {
          return { rows: [{ id: ADMIN_ID, role: ROLES.SYSTEM_ADMIN, email: 'admin@test.edu' }] };
        }
        return { rows: [] };
      }

      // Paper lookup
      if (text.includes('FROM papers') && text.includes('WHERE id = $1')) {
        const paperId = params?.[0];
        if (paperId === 'existing-paper-uuid') {
          return {
            rows: [
              {
                id: 'existing-paper-uuid',
                title: 'Attention Is All You Need',
                abstract: 'The dominant sequence transduction models...',
                authors: ['Ashish Vaswani', 'Noam Shazeer'],
                arxiv_id: '1706.03762',
                uploaded_at: '2023-01-01T00:00:00Z',
              },
            ],
          };
        }
        return { rows: [] };
      }

      // Citations lookups (return empty rows to trigger mock fallback verification)
      if (text.includes('FROM citations')) {
        return { rows: [] };
      }

      return { rows: [] };
    };
  });

  after(() => {
    pool.query = originalQuery;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/papers/any-paper-id/citation-graph');
    assert.equal(res.status, 401);
  });

  it('allows STUDENT role to fetch citation graph', async () => {
    const token = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .get('/api/papers/test-paper-1/citation-graph')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  it('allows RESEARCHER role to fetch citation graph', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .get('/api/papers/test-paper-1/citation-graph')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  it('allows SYSTEM_ADMIN role to fetch citation graph', async () => {
    const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
    const res = await request(app)
      .get('/api/papers/test-paper-1/citation-graph')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  it('returns valid graph structure with backward, forward, and co-citation nodes', async () => {
    const token = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .get('/api/papers/existing-paper-uuid/citation-graph')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    const data = res.body;

    // Check Root Paper
    assert.ok(data.rootPaper, 'Response must include rootPaper');
    assert.equal(data.rootPaper.title, 'Attention Is All You Need');

    // Check Nodes
    assert.ok(Array.isArray(data.nodes), 'Nodes must be an array');
    assert.ok(data.nodes.length >= 10, 'Graph should have ample nodes');

    const nodeTypes = new Set(data.nodes.map((n) => n.node_type));
    assert.ok(nodeTypes.has('root'), 'Must contain root node');
    assert.ok(nodeTypes.has('backward'), 'Must contain backward reference nodes');
    assert.ok(nodeTypes.has('forward'), 'Must contain forward citation nodes');
    assert.ok(nodeTypes.has('co_citation'), 'Must contain co-citation nodes');

    // Check Links
    assert.ok(Array.isArray(data.links), 'Links must be an array');
    const linkTypes = new Set(data.links.map((l) => l.type));
    assert.ok(linkTypes.has('backward'), 'Must contain backward links');
    assert.ok(linkTypes.has('forward'), 'Must contain forward links');
    assert.ok(linkTypes.has('co_citation'), 'Must contain co-citation links');

    // Referential integrity: every link connects existing nodes
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    for (const link of data.links) {
      assert.ok(nodeIds.has(link.source), `Link source ${link.source} must exist in nodes`);
      assert.ok(nodeIds.has(link.target), `Link target ${link.target} must exist in nodes`);
    }

    // Check Clusters
    assert.ok(Array.isArray(data.clusters), 'Clusters must be an array');
    assert.ok(data.clusters.length >= 3, 'Must have at least 3 thematic clusters');
    data.clusters.forEach((cluster) => {
      assert.ok(cluster.id, 'Cluster must have id');
      assert.ok(cluster.name, 'Cluster must have name');
      assert.ok(cluster.color, 'Cluster must have hex color');
    });

    // Check Summary Metrics
    assert.ok(data.summary, 'Summary must exist');
    assert.ok(data.summary.total_nodes > 0);
    assert.ok(data.summary.total_backward > 0);
    assert.ok(data.summary.total_forward > 0);
    assert.ok(data.summary.total_co_citations > 0);
  });

  it('generateMockCitationGraph produces deterministic, valid structures', () => {
    const mockRoot = {
      id: 'paper-xyz',
      title: 'Graph Neural Networks for Molecule Discovery',
      authors: ['Jane Doe', 'John Smith'],
      publication_year: 2022,
    };

    const graph1 = citationService.generateMockCitationGraph(mockRoot);
    const graph2 = citationService.generateMockCitationGraph(mockRoot);

    assert.equal(graph1.nodes.length, graph2.nodes.length);
    assert.equal(graph1.links.length, graph2.links.length);
    assert.equal(graph1.rootPaper.title, 'Graph Neural Networks for Molecule Discovery');
  });
});
