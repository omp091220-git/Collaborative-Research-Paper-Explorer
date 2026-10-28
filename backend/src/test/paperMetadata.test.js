/**
 * paperMetadata.test.js
 *
 * FR-07: Extract and Store Paper Metadata
 *
 * Tests cover:
 *   1. Service unit tests — fetchArxivMetadata: doi and publicationYear extraction
 *   2. Service unit tests — validateUploadMetadata: new doi and publication_year fields
 *   3. Integration tests — POST /api/papers/upload with FR-07 fields
 *   4. Integration tests — GET /api/papers and GET /api/papers/:id return FR-07 fields
 *   5. Validation edge cases — invalid year, wrong doi type, missing optional fields
 *   6. Duplicate DOI detection
 *
 * All database calls are mocked via pool.query replacement.
 * No live database or network connection is required.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';

// Service functions under test (unit-tested directly without HTTP layer)
import {
  fetchArxivMetadata,
  validateUploadMetadata,
  parseArxivId,
  decodeXmlEntities,
  normalizeDoi,
  isValidDoi,
} from '../services/paper.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SECRET = process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';
const RESEARCHER_ID = '11111111-2222-4333-8444-555555555555';
const STUDENT_ID    = '66666666-7777-4888-8999-000000000000';
const PAPER_ID      = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

// Minimal valid PDF stub
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF'
);

const TEMP_VALID_PDF = path.join(__dirname, '_fr07_test_valid.pdf');

// ─── Mock arXiv Atom XML responses ────────────────────────────────────────────
// Includes <arxiv:doi> and <published> — the two new FR-07 fields.
const ATOM_WITH_DOI_AND_YEAR = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>ArXiv Query Results</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <published>2017-06-12T17:57:34Z</published>
    <arxiv:doi>10.5555/3295222.3295349</arxiv:doi>
  </entry>
</feed>`;

const ATOM_WITHOUT_DOI = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>ArXiv Query Results</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <title>Some Preprint Without DOI</title>
    <summary>Abstract text here.</summary>
    <author><name>Jane Doe</name></author>
    <published>2023-01-15T10:00:00Z</published>
  </entry>
</feed>`;

const ATOM_ZERO_RESULTS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>ArXiv Query Results</title>
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`;

// ─── Helper: stub fetchArxivMetadata to return canned Atom XML ────────────────
// We override the https.get that fetchArxivMetadata internally uses by
// replacing the function on the module. For unit tests we call the function
// directly and feed it a mocked https response via monkey-patching node:https.
import https from 'node:https';

function stubHttpsGet(xmlBody, statusCode = 200) {
  const original = https.get;
  https.get = (_url, _opts, callback) => {
    const res = {
      statusCode,
      on(event, handler) {
        if (event === 'data') handler(xmlBody);
        if (event === 'end') handler();
        return res;
      },
    };
    if (callback) callback(res);
    return {
      on() { return this; },
    };
  };
  return () => { https.get = original; };
}

const ATOM_WITH_ATTRIBUTES = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">1</opensearch:totalResults>
  <entry>
    <title>Paper with Tag Attributes</title>
    <summary>Abstract here.</summary>
    <author><name>Alice Smith</name></author>
    <published xmlns="http://www.w3.org/2005/Atom">2021-08-10T12:00:00Z</published>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/attributed-doi</arxiv:doi>
  </entry>
</feed>`;

const ATOM_WITH_XML_ENTITIES = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">1</opensearch:totalResults>
  <entry>
    <title>Quantum &amp; Classical &quot;Entanglement&quot; &lt;Part 1&gt;</title>
    <summary>It&apos;s a study of &#945;-particles and &#x3b2;-decay with &amp; without noise.</summary>
    <author><name>Ren&#233; Descartes</name></author>
    <author><name>Fran&#231;ois Vi&#232;te</name></author>
    <published>2020-05-01T00:00:00Z</published>
    <arxiv:doi>10.1000/182&amp;test</arxiv:doi>
  </entry>
</feed>`;

// =============================================================================
// 1. UNIT TESTS: fetchArxivMetadata — doi and publicationYear extraction
// =============================================================================
describe('FR-07 Service: fetchArxivMetadata', () => {
  it('returns doi and publicationYear when present in Atom feed', async () => {
    const restore = stubHttpsGet(ATOM_WITH_DOI_AND_YEAR);
    try {
      const result = await fetchArxivMetadata('1706.03762');
      assert.equal(result.doi, '10.5555/3295222.3295349');
      assert.equal(result.publicationYear, 2017);
      assert.equal(result.title, 'Attention Is All You Need');
      assert.ok(Array.isArray(result.authors));
      assert.equal(result.authors.length, 2);
      assert.ok(typeof result.abstract === 'string');
    } finally {
      restore();
    }
  });

  it('handles XML tags with attributes on published and arxiv:doi tags', async () => {
    const restore = stubHttpsGet(ATOM_WITH_ATTRIBUTES);
    try {
      const result = await fetchArxivMetadata('2108.00001');
      assert.equal(result.doi, '10.1000/attributed-doi');
      assert.equal(result.publicationYear, 2021);
      assert.equal(result.title, 'Paper with Tag Attributes');
      assert.deepEqual(result.authors, ['Alice Smith']);
    } finally {
      restore();
    }
  });

  it('decodes XML entities in title, abstract, authors, and doi', async () => {
    const restore = stubHttpsGet(ATOM_WITH_XML_ENTITIES);
    try {
      const result = await fetchArxivMetadata('2005.00001');
      assert.equal(result.title, 'Quantum & Classical "Entanglement" <Part 1>');
      assert.equal(result.abstract, "It's a study of α-particles and β-decay with & without noise.");
      assert.deepEqual(result.authors, ['René Descartes', 'François Viète']);
      assert.equal(result.doi, '10.1000/182&test');
      assert.equal(result.publicationYear, 2020);
    } finally {
      restore();
    }
  });

  it('returns null doi when <arxiv:doi> tag is absent', async () => {
    const restore = stubHttpsGet(ATOM_WITHOUT_DOI);
    try {
      const result = await fetchArxivMetadata('2301.00001');
      assert.equal(result.doi, null);
      assert.equal(result.publicationYear, 2023);
    } finally {
      restore();
    }
  });

  it('rejects with 404 when arXiv returns zero results', async () => {
    const restore = stubHttpsGet(ATOM_ZERO_RESULTS);
    try {
      await assert.rejects(
        () => fetchArxivMetadata('9999.99999'),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  it('rejects with 502 on non-200 arXiv API response', async () => {
    const restore = stubHttpsGet('', 503);
    try {
      await assert.rejects(
        () => fetchArxivMetadata('1706.03762'),
        (err) => {
          assert.equal(err.statusCode, 502);
          return true;
        }
      );
    } finally {
      restore();
    }
  });
});

// =============================================================================
// 2. UNIT TESTS: validateUploadMetadata — FR-07 new fields
// =============================================================================
describe('FR-07 Service: validateUploadMetadata', () => {
  it('accepts valid metadata without optional FR-07 fields (backward compat)', () => {
    const result = validateUploadMetadata({
      title: 'My Paper',
      authors: JSON.stringify(['Author One']),
      abstract: 'Some abstract.',
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.doi, null);
    assert.equal(result.data.publicationYear, null);
  });

  it('accepts valid metadata with doi and publication_year', () => {
    const result = validateUploadMetadata({
      title: 'My Paper',
      authors: JSON.stringify(['Author One']),
      doi: '10.1000/xyz123',
      publication_year: 2022,
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.doi, '10.1000/xyz123');
    assert.equal(result.data.publicationYear, 2022);
  });

  it('accepts publication_year as a numeric string', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      publication_year: '2020',
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.publicationYear, 2020);
  });

  it('rejects publication_year that is not a number', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      publication_year: 'banana',
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /publication_year/i);
    assert.equal(result.status, 400);
  });

  it('rejects publication_year below 1665', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      publication_year: 1600,
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /publication_year/i);
  });

  it('rejects publication_year above 2100', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      publication_year: 2200,
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /publication_year/i);
  });

  it('rejects doi that is not a string', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      doi: 12345,
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /DOI/i);
  });

  it('treats empty string doi as null (not an error)', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify(['A']),
      doi: '   ',
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.doi, null);
  });

  it('still rejects missing title', () => {
    const result = validateUploadMetadata({
      authors: JSON.stringify(['A']),
      doi: '10.1/x',
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /title is required/i);
  });

  it('still rejects empty authors', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: JSON.stringify([]),
      doi: '10.1/x',
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /author is required/i);
  });

  it('rejects authors array containing empty strings or whitespace', () => {
    const result1 = validateUploadMetadata({
      title: 'Paper',
      authors: [''],
    });
    assert.equal(result1.valid, false);
    assert.match(result1.error, /author/i);

    const result2 = validateUploadMetadata({
      title: 'Paper',
      authors: ['Author One', '   '],
    });
    assert.equal(result2.valid, false);
    assert.match(result2.error, /author/i);
  });

  it('rejects authors array containing non-string values', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: ['Author One', 123],
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /author/i);
  });

  it('accepts comma-separated authors string', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: 'Author One, Author Two',
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.data.authors, ['Author One', 'Author Two']);
  });

  it('accepts raw array of non-empty author strings', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: ['Author One', 'Author Two'],
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.data.authors, ['Author One', 'Author Two']);
  });

  it('normalizes URL-style DOI to bare DOI', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: ['Author One'],
      doi: 'https://doi.org/10.1000/xyz123',
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.doi, '10.1000/xyz123');
  });

  it('rejects invalid DOI format with status 400', () => {
    const result = validateUploadMetadata({
      title: 'Paper',
      authors: ['Author One'],
      doi: 'not-a-valid-doi',
    });
    assert.equal(result.valid, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /invalid doi format/i);
  });
});

// =============================================================================
// Helper Unit Tests: decodeXmlEntities, normalizeDoi, isValidDoi
// =============================================================================
describe('FR-07 Service: decodeXmlEntities', () => {
  it('decodes predefined XML entities', () => {
    assert.equal(
      decodeXmlEntities('&quot;Hello &amp; World&apos; &lt;1&gt;'),
      '"Hello & World\' <1>'
    );
  });

  it('decodes decimal and hex numeric character references', () => {
    assert.equal(
      decodeXmlEntities('&#65;&#66;&#67; &#x44;&#x45;&#x46; &#233;'),
      'ABC DEF é'
    );
  });

  it('does not double-decode nested entity strings', () => {
    assert.equal(decodeXmlEntities('&amp;lt;'), '&lt;');
  });

  it('handles null, undefined, or empty inputs gracefully', () => {
    assert.equal(decodeXmlEntities(null), null);
    assert.equal(decodeXmlEntities(''), '');
  });
});

describe('FR-07 Service: normalizeDoi and isValidDoi', () => {
  it('normalizes various DOI URL formats and prefixes', () => {
    assert.equal(normalizeDoi('https://doi.org/10.1000/182'), '10.1000/182');
    assert.equal(normalizeDoi('http://dx.doi.org/10.1000/182'), '10.1000/182');
    assert.equal(normalizeDoi('doi: 10.1000/182'), '10.1000/182');
    assert.equal(normalizeDoi('  10.1000/182  '), '10.1000/182');
  });

  it('validates standard DOI formats', () => {
    assert.equal(isValidDoi('10.1000/182'), true);
    assert.equal(isValidDoi('10.5555/3295222.3295349'), true);
    assert.equal(isValidDoi('10.1/x'), true);
    assert.equal(isValidDoi('not-a-doi'), false);
    assert.equal(isValidDoi('10.invalid with space/182'), false);
  });
});

// =============================================================================
// 3. UNIT TESTS: parseArxivId
// =============================================================================
describe('FR-07 Service: parseArxivId', () => {
  it('parses a bare arXiv ID', () => {
    assert.equal(parseArxivId('1706.03762'), '1706.03762');
  });

  it('parses an arXiv ID with version suffix', () => {
    assert.equal(parseArxivId('1706.03762v3'), '1706.03762v3');
  });

  it('parses a full arXiv abs URL', () => {
    assert.equal(parseArxivId('https://arxiv.org/abs/1706.03762'), '1706.03762');
  });

  it('returns null for an invalid ID', () => {
    assert.equal(parseArxivId('not-a-real-id!!!'), null);
  });

  it('returns null for null input', () => {
    assert.equal(parseArxivId(null), null);
  });
});

// =============================================================================
// 4. INTEGRATION TESTS: HTTP endpoints with mocked DB
// =============================================================================
describe('FR-07 Integration: paper endpoints', () => {
  const originalQuery = pool.query;

  before(() => {
    fs.writeFileSync(TEMP_VALID_PDF, MINIMAL_PDF);

    pool.query = async (sql, params) => {
      const text = String(sql);

      // User lookup for authorizeRoles middleware
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params?.[0];
        if (id === RESEARCHER_ID) {
          return {
            rows: [{
              id: RESEARCHER_ID,
              email: 'researcher@test.edu',
              full_name: 'Dr. Test',
              role: ROLES.RESEARCHER,
            }],
          };
        }
        if (id === STUDENT_ID) {
          return {
            rows: [{
              id: STUDENT_ID,
              email: 'student@test.edu',
              full_name: 'Student Test',
              role: ROLES.STUDENT,
            }],
          };
        }
        return { rows: [] };
      }

      // SELECT all papers (GET /api/papers)
      if (
        text.includes('SELECT') &&
        text.includes('FROM papers') &&
        !text.includes('WHERE')
      ) {
        return {
          rows: [{
            id: PAPER_ID,
            title: 'Test Paper',
            abstract: 'Test abstract.',
            authors: ['Author A'],
            arxiv_id: null,
            doi: '10.9999/test',
            publication_year: 2021,
            file_size_bytes: 1024,
            mime_type: 'application/pdf',
            uploader_id: RESEARCHER_ID,
            uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }

      // SELECT single paper (GET /api/papers/:id)
      if (text.includes('FROM papers') && text.includes('WHERE id = $1')) {
        if (params?.[0] === PAPER_ID) {
          return {
            rows: [{
              id: PAPER_ID,
              title: 'Test Paper',
              abstract: 'Test abstract.',
              authors: ['Author A'],
              arxiv_id: null,
              doi: '10.9999/test',
              publication_year: 2021,
              file_size_bytes: 1024,
              mime_type: 'application/pdf',
              uploader_id: RESEARCHER_ID,
              uploaded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          };
        }
        return { rows: [] };
      }

      // arxiv_id duplicate check
      if (text.includes('FROM papers') && text.includes('WHERE arxiv_id = $1')) {
        return { rows: [] }; // no duplicates in FR-07 tests
      }

      // INSERT INTO papers
      // Column order: title, abstract, authors, doi, publication_year,
      //               arxiv_id, file_path, file_size_bytes, mime_type, uploader_id
      if (text.includes('INSERT INTO papers')) {
        const [title, abstract, authors, doi, publication_year] = params;

        // Simulate DOI uniqueness violation
        if (doi === '10.1234/duplicate-doi' || doi === 'DUPLICATE-DOI') {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }

        return {
          rows: [{
            id: PAPER_ID,
            title,
            abstract,
            authors,
            doi: doi ?? null,
            publication_year: publication_year ?? null,
            arxiv_id: params[5] ?? null,
            file_size_bytes: params[7],
            mime_type: 'application/pdf',
            uploader_id: params[9],
            uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }

      return { rows: [] };
    };
  });

  after(() => {
    pool.query = originalQuery;
    try {
      if (fs.existsSync(TEMP_VALID_PDF)) fs.unlinkSync(TEMP_VALID_PDF);
    } catch { /* ignore */ }
  });

  // ── GET /api/papers ──────────────────────────────────────────────────────
  it('GET /api/papers returns doi and publication_year in each paper', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .get('/api/papers')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.papers));
    assert.equal(res.body.papers.length, 1);

    const paper = res.body.papers[0];
    assert.ok('doi' in paper, 'doi field should be present');
    assert.ok('publication_year' in paper, 'publication_year should be present');
    assert.equal(paper.doi, '10.9999/test');
    assert.equal(paper.publication_year, 2021);
  });

  // ── GET /api/papers/:id ──────────────────────────────────────────────────
  it('GET /api/papers/:id returns doi and publication_year', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    const paper = res.body.paper;
    assert.equal(paper.doi, '10.9999/test');
    assert.equal(paper.publication_year, 2021);
  });

  // ── POST /api/papers/upload — with FR-07 fields ──────────────────────────
  it('POST /upload succeeds with doi and publication_year (201)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Paper With Metadata')
      .field('authors', JSON.stringify(['Het']))
      .field('abstract', 'Abstract text.')
      .field('doi', '10.1234/mypaper')
      .field('publication_year', '2022');

    assert.equal(res.status, 201);
    assert.ok(res.body.paper);
    assert.equal(res.body.paper.title, 'Paper With Metadata');
    assert.equal(res.body.paper.doi, '10.1234/mypaper');
    assert.equal(res.body.paper.publication_year, 2022);
  });

  it('POST /upload succeeds without doi and publication_year (backward compat)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Basic Paper')
      .field('authors', JSON.stringify(['Author']));

    assert.equal(res.status, 201);
    assert.ok(res.body.paper);
    assert.equal(res.body.paper.doi, null);
    assert.equal(res.body.paper.publication_year, null);
  });

  it('POST /upload rejects invalid publication_year with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Bad Year Paper')
      .field('authors', JSON.stringify(['Author']))
      .field('publication_year', 'not-a-year');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /publication_year/i);
  });

  it('POST /upload rejects out-of-range publication_year (year < 1665) with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Ancient Paper')
      .field('authors', JSON.stringify(['Author']))
      .field('publication_year', '999');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /publication_year/i);
  });

  it('POST /upload returns 409 when DOI conflicts with existing paper', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Duplicate DOI Paper')
      .field('authors', JSON.stringify(['Author']))
      .field('doi', '10.1234/duplicate-doi'); // mocked to trigger 23505

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/i);
  });

  it('POST /upload normalizes full URL DOI into bare DOI', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'URL DOI Paper')
      .field('authors', JSON.stringify(['Author']))
      .field('doi', 'https://doi.org/10.1234/url-doi');

    assert.equal(res.status, 201);
    assert.equal(res.body.paper.doi, '10.1234/url-doi');
  });

  it('POST /upload with empty doi string treats it as null (no error)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Paper With Empty DOI')
      .field('authors', JSON.stringify(['Author']))
      .field('doi', '');

    assert.equal(res.status, 201);
    assert.equal(res.body.paper.doi, null);
  });

  it('POST /upload succeeds with only doi provided (publication_year is null)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Paper With Only DOI')
      .field('authors', JSON.stringify(['Author']))
      .field('doi', '10.5555/only-doi');

    assert.equal(res.status, 201);
    assert.ok(res.body.paper);
    assert.equal(res.body.paper.title, 'Paper With Only DOI');
    assert.equal(res.body.paper.doi, '10.5555/only-doi');
    assert.equal(res.body.paper.publication_year, null);
  });

  it('POST /upload succeeds with only publication_year provided (doi is null)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Paper With Only Year')
      .field('authors', JSON.stringify(['Author']))
      .field('publication_year', '2024');

    assert.equal(res.status, 201);
    assert.ok(res.body.paper);
    assert.equal(res.body.paper.title, 'Paper With Only Year');
    assert.equal(res.body.paper.doi, null);
    assert.equal(res.body.paper.publication_year, 2024);
  });

  // ── Role checks (FR-06 preserved) ────────────────────────────────────────
  it('STUDENT cannot upload even with FR-07 fields (403)', async () => {
    const token = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Student Paper')
      .field('authors', JSON.stringify(['Student']))
      .field('doi', '10.1/student')
      .field('publication_year', '2022');

    assert.equal(res.status, 403);
  });

  // ── Unauthenticated (FR-06 preserved) ─────────────────────────────────────
  it('GET /api/papers rejects unauthenticated with 401', async () => {
    const res = await request(app).get('/api/papers');
    assert.equal(res.status, 401);
  });

  it('GET /api/papers/:id rejects unauthenticated with 401', async () => {
    const res = await request(app).get(`/api/papers/${PAPER_ID}`);
    assert.equal(res.status, 401);
  });
});
