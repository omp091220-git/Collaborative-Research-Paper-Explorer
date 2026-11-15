import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import {
  fetchArxivPublicationsByAuthor,
  fetchCrossrefPublicationsByAuthor,
  normalizeTitle,
} from '../utils/externalBibliographicClient.js';
import { buildSummaryPdfBuffer } from '../utils/summaryPdfBuilder.js';
import * as discoveryService from '../services/publicationDiscovery.service.js';
import * as exportService from '../services/summaryPdfExport.service.js';

describe('FR-36 & FR-39: External Publications Discovery & Summary PDF Export Suite', () => {
  let server;
  let baseUrl;
  let originalPoolQuery;

  // Test identities
  const researcherUser = {
    id: 'a1000000-0000-4000-8000-000000000001',
    email: 'researcher_publications@test.edu',
    full_name: 'Dr. Geoffrey Hinton',
    role: ROLES.RESEARCHER,
  };

  const studentUser = {
    id: 'a2000000-0000-4000-8000-000000000002',
    email: 'student_tester@test.edu',
    full_name: 'Alice Student',
    role: ROLES.STUDENT,
  };

  const testPaper = {
    id: 'b1000000-0000-4000-8000-000000000001',
    title: 'Deep Residual Learning for Image Recognition',
    abstract: 'Deeper neural networks are more difficult to train. We present a residual learning framework.',
    authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
    arxiv_id: '1512.03385',
    uploaded_at: '2026-01-15T10:00:00Z',
    uploader_id: researcherUser.id,
  };

  let researcherToken;
  let studentToken;

  const authHeaders = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // Mock DB state
  let mockExternalPubs = [];
  let mockSummary = {
    paper_id: testPaper.id,
    summary_text: 'This paper introduces ResNet architecture overcoming vanishing gradient using skip connections.',
    key_findings: ['Residual learning eases training of substantially deeper networks', 'Achieved 3.57% error on ImageNet'],
    created_at: new Date(),
  };

  before(async () => {
    originalPoolQuery = pool.query;

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const secret = process.env.JWT_SECRET || 'super_secret_local_dev_jwt_key_with_at_least_32_characters_12345';
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
    pool.query = async (sql, params = []) => {
      const text = String(sql);

      // Auth middleware user lookup
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params[0];
        if (id === researcherUser.id) return { rows: [researcherUser] };
        if (id === studentUser.id) return { rows: [studentUser] };
        return { rows: [] };
      }

      // External publications queries
      if (text.includes('INSERT INTO external_publications')) {
        const record = {
          id: 'ext-' + Math.random().toString(36).slice(2),
          user_id: params[0],
          title: params[1],
          authors: params[2],
          publication_year: params[3],
          source: params[4],
          external_id: params[5],
          doi: params[6],
          venue: params[7],
          abstract: params[8],
          source_url: params[9],
          is_verified: params[10],
          discovered_at: new Date(),
        };
        mockExternalPubs.push(record);
        return { rows: [record] };
      }

      if (text.includes('FROM external_publications') && text.includes('WHERE user_id = $1')) {
        return { rows: mockExternalPubs };
      }

      if (text.includes('FROM papers') && text.includes('WHERE uploader_id = $1')) {
        return { rows: [{ ...testPaper, external_id: testPaper.id, source: 'platform' }] };
      }

      // Single paper lookup
      if (text.includes('FROM papers') && text.includes('WHERE id = $1')) {
        if (params[0] === testPaper.id) {
          return { rows: [testPaper] };
        }
        return { rows: [] };
      }

      // AI summary lookup
      if (text.includes('FROM paper_summaries') && text.includes('WHERE paper_id = $1')) {
        if (mockSummary && params[0] === testPaper.id) {
          return { rows: [mockSummary] };
        }
        return { rows: [] };
      }

      // Citations lookup
      if (text.includes('FROM citations') && text.includes('WHERE c.citing_paper_id = $1')) {
        return {
          rows: [
            {
              title: 'ImageNet: A Large-Scale Hierarchical Image Database',
              authors: ['J. Deng', 'W. Dong', 'R. Socher'],
              arxiv_id: null,
              publication_year: 2009,
            },
          ],
        };
      }

      return { rows: [] };
    };
  });

  // ============================================================================
  // SECTION 1: FR-39 EXTERNAL PUBLICATION DISCOVERY TESTS
  // ============================================================================
  describe('1. FR-39: External Publication Discovery Unit & Client Tests', () => {
    it('1.1 normalizeTitle cleans punctuation, spaces and casing', () => {
      assert.strictEqual(
        normalizeTitle('Attention Is All You Need! (2017)'),
        'attention is all you need 2017'
      );
      assert.strictEqual(normalizeTitle(''), '');
    });

    it('1.2 fetchArxivPublications handles empty author gracefully without throwing', async () => {
      const results = await fetchArxivPublicationsByAuthor('');
      assert.deepStrictEqual(results, []);
    });

    it('1.3 fetchCrossrefPublications handles empty author gracefully without throwing', async () => {
      const results = await fetchCrossrefPublicationsByAuthor('');
      assert.deepStrictEqual(results, []);
    });

    it('1.4 discoveryService returns researcher metadata and merges platform + external records', async () => {
      const result = await discoveryService.discoverResearcherPublications({
        userId: researcherUser.id,
        authorQuery: 'Geoffrey Hinton',
        limit: 5,
      });

      assert.ok(result.researcher);
      assert.strictEqual(result.researcher.fullName, researcherUser.full_name);
      assert.ok(result.counts.total >= 1);
      assert.ok(Array.isArray(result.publications));
    });
  });

  // ============================================================================
  // SECTION 2: FR-36 PDF EXPORT & FAILURE HANDLING TESTS
  // ============================================================================
  describe('2. FR-36: PDF Summary Export & Error Handling Unit Tests', () => {
    it('2.1 buildSummaryPdfBuffer creates non-empty binary PDF with header markers', () => {
      const pdf = buildSummaryPdfBuffer({
        paperTitle: 'Advances in Deep Learning',
        authors: ['Y. LeCun', 'Y. Bengio'],
        publicationYear: 2024,
        abstract: 'Comprehensive survey of representations.',
        summaryText: 'Core findings indicate self-supervised models learn generalized features.',
        citations: [{ title: 'Backpropagation Applied to Handwritten Zip Code', authors: ['Y. LeCun'], year: 1989 }],
      });

      assert.ok(Buffer.isBuffer(pdf));
      assert.ok(pdf.length > 300, `PDF must contain binary payload, got ${pdf.length} bytes`);
      const text = pdf.toString('utf-8');
      assert.ok(text.includes('%PDF-1.4'));
      assert.ok(text.includes('RESEARCH PAPER SUMMARY'));
    });

    it('2.2 buildSummaryPdfBuffer throws descriptive error on missing required inputs', () => {
      assert.throws(() => {
        buildSummaryPdfBuffer({ paperTitle: '', summaryText: '' });
      }, /PAPER_DATA_INCOMPLETE/);
    });

    it('2.3 exportPaperSummaryPdf returns formatted PDF buffer and preserved citations', async () => {
      const result = await exportService.exportPaperSummaryPdf(testPaper.id);
      assert.ok(Buffer.isBuffer(result.pdfBuffer));
      assert.ok(result.filename.endsWith('.pdf'));
      assert.ok(result.contentLength > 200);
    });

    it('2.4 exportPaperSummaryPdf throws 404 for non-existent paper', async () => {
      await assert.rejects(
        async () => {
          await exportService.exportPaperSummaryPdf('00000000-0000-0000-0000-000000000000');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // SECTION 3: HTTP INTEGRATION & ACCEPTANCE TESTS (FR-36 & FR-39)
  // ============================================================================
  describe('3. HTTP API Endpoints & Acceptance Tests', () => {
    it('3.1 POST /api/researchers/:id/publications/discover: rejects unauthenticated with 401', async () => {
      const res = await fetch(`${baseUrl}/api/researchers/${researcherUser.id}/publications/discover`, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 401);
    });

    it('3.2 POST /api/researchers/:id/publications/discover: discovers publications with 200 OK', async () => {
      const res = await fetch(`${baseUrl}/api/researchers/${researcherUser.id}/publications/discover`, {
        method: 'POST',
        headers: authHeaders(researcherToken),
        body: JSON.stringify({ authorQuery: 'Geoffrey Hinton', limit: 5 }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.message.includes('discovered'));
      assert.ok(data.counts.total >= 1);
      assert.ok(Array.isArray(data.publications));
    });

    it('3.3 GET /api/researchers/:id/publications: fetches profile publications without re-crawling', async () => {
      const res = await fetch(`${baseUrl}/api/researchers/${researcherUser.id}/publications`, {
        headers: authHeaders(studentToken),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.researcher);
      assert.ok(Array.isArray(data.publications));
    });

    it('3.4 GET /api/papers/:id/export/summary-pdf: exports formatted PDF buffer with correct headers', async () => {
      const res = await fetch(`${baseUrl}/api/papers/${testPaper.id}/export/summary-pdf`, {
        headers: authHeaders(researcherToken),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
      assert.ok(res.headers.get('content-disposition').includes('.pdf'));

      const buffer = await res.arrayBuffer();
      assert.ok(buffer.byteLength > 200, 'Downloaded file must contain valid PDF content');
    });

    it('3.5 GET /api/papers/:id/export/summary-pdf: reports failure clearly on invalid paper id (FR-36 acceptance)', async () => {
      const res = await fetch(`${baseUrl}/api/papers/invalid-uuid-format/export/summary-pdf`, {
        headers: authHeaders(researcherToken),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'INVALID_PAPER_ID');
      assert.ok(data.message.includes('valid paper UUID is required'));
    });
  });
});
