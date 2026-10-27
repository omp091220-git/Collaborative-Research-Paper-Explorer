/**
 * arxivImport.test.js
 *
 * Covers two areas that the prior test suite left unexercised:
 *
 * 1. downloadArxivPdf — unit tests for redirect handling.
 *    Regression tests for the ERR_INVALID_URL crash when arXiv returns a
 *    relative Location header such as "/pdf/2610.30421".
 *    The helper is tested by monkey-patching node:https so no live network
 *    connection is required.
 *
 * 2. POST /api/papers/import — full workflow integration tests.
 *    The previous suite stopped at the DB duplicate-check phase.  These tests
 *    drive the happy path (metadata fetch -> PDF download -> DB insert) and
 *    the main failure paths, with all external dependencies mocked.
 *
 * Framework: node:test (built-in, same as the rest of the project).
 * No additional dependencies are introduced.
 */

import { describe, it, afterEach } from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';
import { downloadArxivPdf } from '../services/paper.service.js';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SECRET =
  process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';
const RESEARCHER_ID = '11111111-2222-4333-8444-555555555555';
const PAPER_ID = 'dddddddd-eeee-4fff-8000-111111111111';

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

// ─── Minimal valid PDF bytes ──────────────────────────────────────────────────
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF'
);

// ─── Atom XML used by integration tests ──────────────────────────────────────
const ATOM_WITH_DOI_AND_YEAR = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>ArXiv Query Results</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on complex recurrent networks.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <published>2017-06-12T17:57:34Z</published>
    <arxiv:doi>10.5555/3295222.3295349</arxiv:doi>
  </entry>
</feed>`;

// =============================================================================
// SECTION 1 — Unit tests: downloadArxivPdf redirect handling
// =============================================================================

describe('downloadArxivPdf — redirect handling', () => {
  const originalHttpsGet = https.get;

  afterEach(() => {
    https.get = originalHttpsGet;
  });

  // Helper: fake HTTP response.
  //
  // For redirect responses (body: null): resume() is a no-op; the production
  // code never calls pipe() on redirect responses, so it is not needed.
  //
  // For 200+body responses: the production code calls res.pipe(fileStream).
  // We implement pipe() to write body to the dest via process.nextTick so the
  // write is deferred until after pipe() has been registered — matching real
  // stream ordering.  We also emit 'data' so the downloaded-bytes counter
  // in the production code increments correctly.
  function fakeRes({ statusCode, headers = {}, body = null }) {
    const em = new EventEmitter();
    em.statusCode = statusCode;
    em.headers = headers;
    em.resume = () => {};
    em.pipe = (dest) => {
      if (!body) { process.nextTick(() => dest.end()); return em; }
      process.nextTick(() => {
        em.emit('data', body);   // lets the size-guard counter run
        dest.write(body);
        dest.end();
      });
      return em;
    };
    return em;
  }

  // Helper: fake request object.
  function fakeReq() {
    return { on() { return this; }, destroy() {} };
  }


  // ── Test 1: absolute redirect URL ─────────────────────────────────────────
  it('follows an absolute HTTPS redirect to the final PDF', async () => {
    const dest = path.join(os.tmpdir(), `t-abs-${Date.now()}.pdf`);
    let calls = 0;
    https.get = (_url, _opts, cb) => {
      calls += 1;
      cb(calls === 1
        ? fakeRes({ statusCode: 301, headers: { location: 'https://arxiv.org/pdf/1706.03762' } })
        : fakeRes({ statusCode: 200, body: MINIMAL_PDF }));
      return fakeReq();
    };
    try {
      const bytes = await downloadArxivPdf('1706.03762', dest);
      assert.ok(bytes > 0);
      assert.equal(calls, 2);
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 2: relative redirect URL — regression for ERR_INVALID_URL ────────
  it('resolves a relative Location header against the request origin (regression)', async () => {
    const dest = path.join(os.tmpdir(), `t-rel-${Date.now()}.pdf`);
    let calls = 0;
    const resolvedUrls = [];
    https.get = (url, _opts, cb) => {
      calls += 1;
      resolvedUrls.push(url);
      cb(calls === 1
        ? fakeRes({ statusCode: 302, headers: { location: '/pdf/2610.30421' } })
        : fakeRes({ statusCode: 200, body: MINIMAL_PDF }));
      return fakeReq();
    };
    try {
      const bytes = await downloadArxivPdf('2610.30421', dest);
      assert.ok(bytes > 0, 'should have written non-zero bytes');
      assert.equal(calls, 2, 'should have made exactly 2 requests');
      assert.equal(
        resolvedUrls[1],
        'https://arxiv.org/pdf/2610.30421',
        'relative location must be resolved to an absolute URL'
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 3: multi-step redirect ───────────────────────────────────────────
  it('follows a multi-step redirect chain (relative -> relative -> 200)', async () => {
    const dest = path.join(os.tmpdir(), `t-multi-${Date.now()}.pdf`);
    let calls = 0;
    https.get = (_url, _opts, cb) => {
      calls += 1;
      if (calls === 1) cb(fakeRes({ statusCode: 301, headers: { location: '/step2' } }));
      else if (calls === 2) cb(fakeRes({ statusCode: 307, headers: { location: '/step3' } }));
      else cb(fakeRes({ statusCode: 200, body: MINIMAL_PDF }));
      return fakeReq();
    };
    try {
      const bytes = await downloadArxivPdf('2301.00001', dest);
      assert.ok(bytes > 0);
      assert.equal(calls, 3);
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 4: missing Location header ──────────────────────────────────────
  it('rejects when a redirect has no Location header', async () => {
    const dest = path.join(os.tmpdir(), `t-noloc-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb(fakeRes({ statusCode: 301, headers: {} }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('2301.00001', dest),
        (err) => { assert.match(err.message, /redirect without location/i); return true; }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 5: unparseable / invalid Location value ──────────────────────────
  // A string starting with \0 (NUL) cannot form a valid URL under any base.
  it('rejects with statusCode 502 for an unparseable Location value', async () => {
    const dest = path.join(os.tmpdir(), `t-badloc-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb(fakeRes({ statusCode: 302, headers: { location: 'http://[' } }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('2301.00001', dest),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.match(err.message, /invalid redirect location/i);
          return true;
        }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 6: unsafe protocol in redirect ───────────────────────────────────
  it('rejects with statusCode 502 when redirect resolves to a non-http/https scheme', async () => {
    const dest = path.join(os.tmpdir(), `t-proto-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb(fakeRes({ statusCode: 302, headers: { location: 'javascript:alert(1)' } }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('2301.00001', dest),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.match(err.message, /unsafe redirect protocol/i);
          return true;
        }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  it('rejects with statusCode 502 when redirect downgrades from HTTPS to HTTP', async () => {
    const dest = path.join(os.tmpdir(), `t-downgrade-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb(fakeRes({ statusCode: 302, headers: { location: 'http://example.com/pdf/1706.03762' } }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('1706.03762', dest),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.match(err.message, /protocol downgrade/i);
          return true;
        }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  it('rejects with statusCode 502 when redirect targets a private or loopback host (SSRF)', async () => {
    const dest = path.join(os.tmpdir(), `t-ssrf-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb(fakeRes({ statusCode: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('1706.03762', dest),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.match(err.message, /disallowed redirect destination/i);
          return true;
        }
      );
      assert.equal(fs.existsSync(dest), false, 'dest file must be unlinked on failure');
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 7: redirect limit ────────────────────────────────────────────────
  it('rejects after exceeding the 5-redirect limit', async () => {
    const dest = path.join(os.tmpdir(), `t-limit-${Date.now()}.pdf`);
    let calls = 0;
    https.get = (_url, _opts, cb) => {
      calls += 1;
      cb(fakeRes({ statusCode: 301, headers: { location: '/pdf/loop' } }));
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('2301.00001', dest),
        (err) => { assert.match(err.message, /too many redirects/i); return true; }
      );
      assert.ok(calls >= 6, `expected >=6 calls, got ${calls}`);
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 8: 404 from arXiv ────────────────────────────────────────────────
  it('rejects with statusCode 404 when arXiv returns 404', async () => {
    const dest = path.join(os.tmpdir(), `t-404-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb({ statusCode: 404, headers: {}, resume() {}, on() { return this; } });
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('9999.99999', dest),
        (err) => { assert.equal(err.statusCode, 404); return true; }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });

  // ── Test 9: non-200/non-redirect status ──────────────────────────────────
  it('rejects with statusCode 502 for an unexpected non-200 status', async () => {
    const dest = path.join(os.tmpdir(), `t-503-${Date.now()}.pdf`);
    https.get = (_url, _opts, cb) => {
      cb({ statusCode: 503, headers: {}, resume() {}, on() { return this; } });
      return fakeReq();
    };
    try {
      await assert.rejects(
        () => downloadArxivPdf('1706.03762', dest),
        (err) => { assert.equal(err.statusCode, 502); return true; }
      );
    } finally {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  });
});

// =============================================================================
// SECTION 2 — Integration tests: POST /api/papers/import full workflow
// =============================================================================

describe('POST /api/papers/import — full workflow integration', () => {
  const originalHttpsGet = https.get;
  const originalQuery = pool.query;

  afterEach(() => {
    https.get = originalHttpsGet;
    pool.query = originalQuery;
  });

  // ── DB stub factory ───────────────────────────────────────────────────────
  function makeDbMock({ arxivDuplicate = false } = {}) {
    return async (sql, params) => {
      const text = String(sql);

      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        if (params?.[0] === RESEARCHER_ID) {
          return {
            rows: [{
              id: RESEARCHER_ID,
              email: 'researcher@test.edu',
              full_name: 'Dr. Test',
              role: ROLES.RESEARCHER,
            }],
          };
        }
        return { rows: [] };
      }

      if (text.includes('WHERE arxiv_id = $1')) {
        if (arxivDuplicate) {
          return { rows: [{ id: PAPER_ID, title: 'Already Imported' }] };
        }
        return { rows: [] };
      }

      if (text.includes('INSERT INTO papers')) {
        const [title, abstract, authors, doi, publication_year] = params;
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
  }

  // ── HTTPS stub factory ────────────────────────────────────────────────────
  // Distinguishes the metadata call (export.arxiv.org) from the PDF call
  // (arxiv.org/pdf) by URL content.
  // redirectOnPdf: first PDF request returns a relative 302, second returns 200.
  // failPdf: PDF request returns 503.
  function makeHttpsMock({ redirectOnPdf = false, failPdf = false } = {}) {
    let pdfCalls = 0;
    return (url, _opts, cb) => {
      const urlStr = String(url);

      if (urlStr.includes('export.arxiv.org')) {
        cb({
          statusCode: 200,
          on(event, handler) {
            if (event === 'data') handler(ATOM_WITH_DOI_AND_YEAR);
            if (event === 'end') handler();
            return this;
          },
        });
        return { on() { return this; }, destroy() {} };
      }

      if (urlStr.includes('arxiv.org/pdf') || urlStr.includes('arxiv.org/pdf')) {
        pdfCalls += 1;

        if (failPdf) {
          cb({ statusCode: 503, headers: {}, resume() {}, on() { return this; } });
          return { on() { return this; }, destroy() {} };
        }

        if (redirectOnPdf && pdfCalls === 1) {
          cb({
            statusCode: 302,
            headers: { location: '/pdf/1706.03762' },
            resume() {},
            on() { return this; },
          });
          return { on() { return this; }, destroy() {} };
        }

        cb({
          statusCode: 200,
          headers: {},
          on() { return this; },
          pipe(dest) { dest.write(MINIMAL_PDF); dest.end(); },
        });
        return { on() { return this; }, destroy() {} };
      }

      cb({ statusCode: 200, headers: {}, on() { return this; }, pipe(d) { d.end(); } });
      return { on() { return this; }, destroy() {} };
    };
  }

  // ── Test 1: successful import with DOI and publication_year ──────────────
  it('returns 201 with paper including doi and publication_year on success', async () => {
    https.get = makeHttpsMock();
    pool.query = makeDbMock();

    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });

    assert.equal(res.status, 201, `expected 201 but got ${res.status}: ${res.body?.error}`);
    assert.ok(res.body.paper, 'response should include paper object');
    assert.equal(res.body.paper.title, 'Attention Is All You Need');
    assert.equal(res.body.paper.doi, '10.5555/3295222.3295349', 'DOI extracted from Atom feed');
    assert.equal(res.body.paper.publication_year, 2017, 'year extracted from Atom feed');
    assert.equal(res.body.paper.arxiv_id, '1706.03762');
    assert.match(res.body.message, /imported from arXiv/i);
  });

  // ── Test 2: successful import via relative redirect (regression) ──────────
  it('returns 201 when PDF is served after a relative-URL redirect', async () => {
    https.get = makeHttpsMock({ redirectOnPdf: true });
    pool.query = makeDbMock();

    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });

    assert.equal(res.status, 201, `expected 201 but got ${res.status}: ${res.body?.error}`);
    assert.ok(res.body.paper);
  });

  // ── Test 3: missing arxiv_id ──────────────────────────────────────────────
  it('returns 400 when arxiv_id is absent', async () => {
    pool.query = makeDbMock();
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /arxiv_id is required/i);
  });

  // ── Test 4: invalid arXiv ID format ──────────────────────────────────────
  it('returns 400 for a syntactically invalid arXiv ID', async () => {
    pool.query = makeDbMock();
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: 'not-a-real-arxiv-id!!!' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid arxiv id format/i);
  });

  // ── Test 5: duplicate arxiv_id returns 409 ────────────────────────────────
  it('returns 409 when the arXiv ID is already in the database', async () => {
    pool.query = makeDbMock({ arxivDuplicate: true });
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already in the system/i);
    assert.ok(res.body.paper, 'conflicting paper should be returned in response');
  });

  // ── Test 6: metadata fetch failure ───────────────────────────────────────
  it('returns 5xx when the arXiv metadata API fails', async () => {
    https.get = (_url, _opts, _cb) => {
      const req = {
        on(event, handler) {
          if (event === 'error') {
            handler(Object.assign(new Error('connect ECONNREFUSED'), { statusCode: 503 }));
          }
          return this;
        },
        destroy() {},
      };
      return req;
    };
    pool.query = makeDbMock();

    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });

    assert.ok(
      res.status === 502 || res.status === 503,
      `expected 502 or 503, got ${res.status}`
    );
  });

  // ── Test 7: PDF download failure ──────────────────────────────────────────
  it('returns 502 when the PDF download fails with a server error', async () => {
    https.get = makeHttpsMock({ failPdf: true });
    pool.query = makeDbMock();

    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });

    assert.equal(res.status, 502, `expected 502 but got ${res.status}: ${res.body?.error}`);
    // The controller returns the service's own message when present; the
    // service reports the HTTP status code it received from arXiv.
    assert.match(res.body.error, /arxiv responded with status|failed to download/i);
  });

  // ── Test 8: unauthenticated ───────────────────────────────────────────────
  it('returns 401 when no JWT is provided', async () => {
    const res = await request(app)
      .post('/api/papers/import')
      .send({ arxiv_id: '1706.03762' });
    assert.equal(res.status, 401);
  });

  // ── Test 9: STUDENT role forbidden ───────────────────────────────────────
  it('returns 403 for the STUDENT role', async () => {
    const STUDENT_ID = '66666666-7777-4888-8999-000000000000';
    pool.query = async (sql, params) => {
      if (String(sql).includes('FROM users') && String(sql).includes('WHERE id = $1')) {
        return {
          rows: [{
            id: STUDENT_ID,
            email: 'student@test.edu',
            full_name: 'Test Student',
            role: ROLES.STUDENT,
          }],
        };
      }
      return { rows: [] };
    };
    const token = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });
    assert.equal(res.status, 403);
  });
});
