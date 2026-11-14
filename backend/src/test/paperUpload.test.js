import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { isValidPdf } from '../utils/pdfValidator.js';
import { ROLES } from '../utils/roles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SECRET = process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';
const RESEARCHER_ID = '11111111-2222-4333-8444-555555555555';
const STUDENT_ID = '66666666-7777-4888-8999-000000000000';

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

// Minimal valid PDF binary stub (%PDF-1.4 header)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF'
);

const TEMP_VALID_PDF = path.join(__dirname, '_test_valid_paper.pdf');
const TEMP_CORRUPT_PDF = path.join(__dirname, '_test_corrupt.pdf');
const TEMP_TXT_FILE = path.join(__dirname, '_test_dummy.txt');

const originalQuery = pool.query;

describe('Paper Upload and Import Test Suite', () => {
  before(() => {
    fs.writeFileSync(TEMP_VALID_PDF, MINIMAL_PDF);
    fs.writeFileSync(TEMP_CORRUPT_PDF, Buffer.from('NOT A REAL PDF HEADER 123456'));
    fs.writeFileSync(TEMP_TXT_FILE, 'Plain text file content');

    // Mock database queries
    pool.query = async (sql, params) => {
      const text = String(sql);

      // User lookup for authorizeRoles
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params?.[0];
        if (id === RESEARCHER_ID) {
          return {
            rows: [{
              id: RESEARCHER_ID,
              email: 'researcher@university.edu',
              full_name: 'Dr. Researcher',
              role: ROLES.RESEARCHER,
            }],
          };
        }
        if (id === STUDENT_ID) {
          return {
            rows: [{
              id: STUDENT_ID,
              email: 'student@university.edu',
              full_name: 'Alice Student',
              role: ROLES.STUDENT,
            }],
          };
        }
        return { rows: [] };
      }

      // GET /api/papers (repository now selects doi, publication_year too)
      if (text.includes('SELECT') && text.includes('FROM papers') && !text.includes('WHERE')) {
        return {
          rows: [
            {
              id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
              title: 'Attention Is All You Need',
              abstract: 'The dominant sequence transduction models are based on complex recurrent networks...',
              authors: ['Ashish Vaswani', 'Noam Shazeer'],
              arxiv_id: '1706.03762',
              doi: '10.5555/12345678',
              publication_year: 2017,
              file_size_bytes: 524288,
              mime_type: 'application/pdf',
              uploader_id: RESEARCHER_ID,
              uploaded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }

      // Check arXiv duplicate
      if (text.includes('SELECT id, title FROM papers WHERE arxiv_id = $1')) {
        if (params?.[0] === '1706.03762') {
          return {
            rows: [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'Attention Is All You Need' }],
          };
        }
        return { rows: [] };
      }

      // INSERT INTO papers
      // New column order (paper.repository.js insertPaper):
      //   $1=title, $2=abstract, $3=authors, $4=doi, $5=publication_year,
      //   $6=arxiv_id, $7=file_path, $8=file_size_bytes, $9=mime_type, $10=uploader_id
      if (text.includes('INSERT INTO papers')) {
        return {
          rows: [
            {
              id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
              title: params[0],
              abstract: params[1],
              authors: params[2],
              doi: params[3] || null,
              publication_year: params[4] || null,
              arxiv_id: params[5] || null,
              file_size_bytes: params[7],
              mime_type: 'application/pdf',
              uploader_id: params[9],
              uploaded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }

      return { rows: [] };
    };
  });

  after(() => {
    pool.query = originalQuery;
    for (const f of [TEMP_VALID_PDF, TEMP_CORRUPT_PDF, TEMP_TXT_FILE]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  // 1. Unauthenticated Requests
  it('GET /api/papers rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/papers');
    assert.equal(res.status, 401);
  });

  it('POST /api/papers/upload rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/papers/upload');
    assert.equal(res.status, 401);
  });

  it('POST /api/papers/import rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/papers/import').send({ arxiv_id: '1706.03762' });
    assert.equal(res.status, 401);
  });

  // 2. Role-Based Authorization
  it('STUDENT role is forbidden (403) from uploading papers', async () => {
    const studentToken = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Student Paper')
      .field('authors', JSON.stringify(['Student']));
    assert.equal(res.status, 403);
  });

  it('STUDENT role is forbidden (403) from importing arXiv papers', async () => {
    const studentToken = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ arxiv_id: '2301.00001' });
    assert.equal(res.status, 403);
  });

  it('STUDENT can view list of papers via GET /api/papers', async () => {
    const studentToken = tokenFor(STUDENT_ID, ROLES.STUDENT);
    const res = await request(app)
      .get('/api/papers')
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.papers));
    assert.equal(res.body.papers.length, 1);
  });

  // 3. PDF Upload Validation
  it('POST /api/papers/upload rejects request without file with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Some Title')
      .field('authors', JSON.stringify(['Author']));
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/papers/upload rejects non-PDF file MIME with 415', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_TXT_FILE, { contentType: 'text/plain' })
      .field('title', 'Text File')
      .field('authors', JSON.stringify(['Author']));
    assert.equal(res.status, 415);
  });

  it('POST /api/papers/upload rejects corrupted PDF (invalid magic bytes) with 415', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_CORRUPT_PDF, { contentType: 'application/pdf' })
      .field('title', 'Corrupt PDF')
      .field('authors', JSON.stringify(['Author']));
    assert.equal(res.status, 415);
    assert.match(res.body.error, /not a valid PDF/i);
  });

  it('POST /api/papers/upload rejects files exceeding 30 MiB with 413', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const oversizedPdfPath = path.join(__dirname, '_test_oversized.pdf');
    const fd = fs.openSync(oversizedPdfPath, 'w');
    fs.writeSync(fd, Buffer.from('%PDF-1.4\n'));
    fs.writeSync(fd, Buffer.alloc(1024), 0, 1024, 31457280);
    fs.closeSync(fd);

    try {
      const res = await request(app)
        .post('/api/papers/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('pdf', oversizedPdfPath)
        .field('title', 'Oversized Paper')
        .field('authors', JSON.stringify(['Author']));
      assert.equal(res.status, 413);
      assert.match(res.body.error, /30 MB|limit/i);
    } finally {
      if (fs.existsSync(oversizedPdfPath)) fs.unlinkSync(oversizedPdfPath);
    }
  });

  it('POST /api/papers/upload rejects valid PDF missing required title with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', '   ')
      .field('authors', JSON.stringify(['Author']));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /title is required/i);
  });

  it('POST /api/papers/upload rejects valid PDF missing required authors with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Valid Title')
      .field('authors', JSON.stringify([]));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /author is required/i);
  });

  it('POST /api/papers/upload succeeds with valid PDF and metadata (201)', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdf', TEMP_VALID_PDF)
      .field('title', 'Valid Research Paper')
      .field('abstract', 'This is an abstract.')
      .field('authors', JSON.stringify(['Dr. Researcher', 'Co-author']));
    assert.equal(res.status, 201);
    assert.ok(res.body.paper);
    assert.equal(res.body.paper.title, 'Valid Research Paper');
  });

  // 4. arXiv Import Validation
  it('POST /api/papers/import rejects missing arxiv_id with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '   ' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /arxiv_id is required/i);
  });

  it('POST /api/papers/import rejects invalid arXiv ID format with 400', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: 'invalid-id-xyz!@#' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid arxiv id format/i);
  });

  it('POST /api/papers/import detects existing duplicate paper with 409', async () => {
    const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
    const res = await request(app)
      .post('/api/papers/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ arxiv_id: '1706.03762' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already in the system/i);
  });

  // 5. PDF Magic Bytes Validator Utility
  it('isValidPdf returns true for valid %PDF- magic bytes', async () => {
    assert.equal(await isValidPdf(TEMP_VALID_PDF), true);
  });

  it('isValidPdf returns false for corrupt header', async () => {
    assert.equal(await isValidPdf(TEMP_CORRUPT_PDF), false);
  });

  it('isValidPdf returns false for text file', async () => {
    assert.equal(await isValidPdf(TEMP_TXT_FILE), false);
  });

  it('isValidPdf returns false for nonexistent file', async () => {
    assert.equal(await isValidPdf(path.join(__dirname, 'nonexistent_file.pdf')), false);
  });
});
