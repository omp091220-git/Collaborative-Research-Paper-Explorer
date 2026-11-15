import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaperPdfPath } from '../workers/extractionJobProcessor.js';

// Resolve __dirname for this test file (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compute expected repository root based on processor location
const processorDir = path.resolve(__dirname, '../../src/workers');
const expectedRepoRoot = path.resolve(processorDir, '../../..');

describe('resolvePaperPdfPath function', () => {
  it('should resolve a repository‑root‑relative path correctly', () => {
    const rel = 'uploads/papers/sample.pdf';
    const resolved = resolvePaperPdfPath(rel);
    const expected = path.resolve(expectedRepoRoot, rel);
    assert.equal(resolved, expected);
  });

  it('should return absolute paths unchanged', () => {
    const abs = path.resolve('C:/some/absolute/path.pdf');
    const resolved = resolvePaperPdfPath(abs);
    assert.equal(resolved, abs);
  });

  it('should return empty string for falsy input', () => {
    assert.equal(resolvePaperPdfPath(''), '');
    assert.equal(resolvePaperPdfPath(null), '');
    assert.equal(resolvePaperPdfPath(undefined), '');
  });
});

