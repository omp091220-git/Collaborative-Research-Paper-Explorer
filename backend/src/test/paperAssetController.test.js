/**
 * paperAssetController.test.js
 *
 * Isolated unit tests for the paperAsset controller using injected mock service.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';

import { createPaperAssetController } from '../controllers/paperAsset.controller.js';
import { PaperAssetError } from '../services/paperAsset.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create mock request/response objects
function createMockReqRes({ params = {}, query = {}, body = {}, user = null } = {}) {
  const req = { params, query, body, user };

  class MockResponse extends Writable {
    constructor() {
      super();
      this.headers = {};
      this.statusCode = 200;
      this.jsonPayload = null;
      this.chunks = [];
      this.headersSent = false;
    }

    _write(chunk, encoding, callback) {
      this.headersSent = true;
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }

    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    }

    getHeader(key) {
      return this.headers[key.toLowerCase()];
    }

    status(code) {
      this.statusCode = code;
      return this;
    }

    json(data) {
      this.jsonPayload = data;
      return this;
    }

    destroy(error, callback) {
      return super.destroy(error, callback);
    }
  }

  const res = new MockResponse();
  return { req, res };
}

// Compute fixture directory dedicated strictly to this test suite
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const REAL_ASSETS_DIR = path.join(BACKEND_ROOT, 'uploads', 'assets');
const TEST_DIR_NAME = 'test-controller-paper-uuid';
const TEST_FIXTURE_DIR = path.join(REAL_ASSETS_DIR, TEST_DIR_NAME);
const LEGACY_LEFTOVER_DIR = path.join(REAL_ASSETS_DIR, 'paper-uuid-asset');

function safeCleanupFixtureDirs() {
  try {
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(LEGACY_LEFTOVER_DIR)) {
      fs.rmSync(LEGACY_LEFTOVER_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors during teardown
  }
}

describe('paperAssetController – listAssets', () => {
  let mockService;
  let controller;

  beforeEach(() => {
    mockService = {
      getActiveAssets: async () => ({ assets: [], count: 0 }),
      getAssetBinary: async () => ({ asset: {}, filePath: '' }),
      getExtractionStatus: async () => ({ status: 'not_extracted', job: null }),
      requestExtraction: async () => ({ job: null, alreadyExists: false }),
    };
    controller = createPaperAssetController(mockService);
  });

  it('successfully returns assets list (200)', async () => {
    const fakeAssets = [
      { id: 'asset-1', asset_type: 'figure', page_number: 1 },
      { id: 'asset-2', asset_type: 'table', page_number: 3 },
    ];
    let receivedFilter = null;
    mockService.getActiveAssets = async (paperId, filter) => {
      receivedFilter = filter;
      return { assets: fakeAssets, count: fakeAssets.length };
    };

    const { req, res } = createMockReqRes({
      params: { paperId: 'paper-123' },
      query: { asset_type: 'figure' },
    });
    let nextCalled = false;
    await controller.listAssets(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(receivedFilter, { assetType: 'figure' });
    assert.equal(res.jsonPayload.count, 2);
    assert.deepEqual(res.jsonPayload.assets, fakeAssets);
  });

  it('handles PaperAssetError and returns client error status', async () => {
    mockService.getActiveAssets = async () => {
      throw new PaperAssetError('Invalid asset_type filter.', 400);
    };

    const { req, res } = createMockReqRes({ params: { paperId: 'paper-123' } });
    await controller.listAssets(req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.error, 'Invalid asset_type filter.');
  });

  it('forwards unexpected service errors to next(error)', async () => {
    const unexpectedErr = new Error('Database connection failed');
    mockService.getActiveAssets = async () => {
      throw unexpectedErr;
    };

    const { req, res } = createMockReqRes({ params: { paperId: 'paper-123' } });
    let passedError = null;
    await controller.listAssets(req, res, (err) => {
      passedError = err;
    });

    assert.equal(passedError, unexpectedErr);
  });
});

describe('paperAssetController – requestExtraction', () => {
  let mockService;
  let controller;

  beforeEach(() => {
    mockService = {
      getActiveAssets: async () => ({ assets: [], count: 0 }),
      getAssetBinary: async () => ({ asset: {}, filePath: '' }),
      getExtractionStatus: async () => ({ status: 'not_extracted', job: null }),
      requestExtraction: async () => ({ job: { id: 'new-job', status: 'pending' }, alreadyExists: false }),
    };
    controller = createPaperAssetController(mockService);
  });

  it('creates a new job when none exists (202)', async () => {
    mockService.requestExtraction = async () => ({
      job: { id: 'new-job-uuid', status: 'pending' },
      alreadyExists: false,
    });
    const { req, res } = createMockReqRes({ params: { paperId: 'paper-uuid' } });
    await controller.requestExtraction(req, res, () => {});

    assert.equal(res.statusCode, 202);
    assert.ok(res.jsonPayload.job);
    assert.equal(res.jsonPayload.job.id, 'new-job-uuid');
    assert.equal(res.jsonPayload.job.status, 'pending');
  });

  it('returns existing pending job as 200 (queued)', async () => {
    mockService.requestExtraction = async () => ({
      job: { id: 'job-1', status: 'queued' },
      alreadyExists: true,
    });
    const { req, res } = createMockReqRes({ params: { paperId: 'paper-uuid' } });
    await controller.requestExtraction(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.ok(res.jsonPayload.job);
    assert.equal(res.jsonPayload.job.id, 'job-1');
    assert.equal(res.jsonPayload.job.status, 'queued');
  });

  it('forwards unexpected service errors to next(error)', async () => {
    const unexpectedErr = new Error('Queue error');
    mockService.requestExtraction = async () => {
      throw unexpectedErr;
    };

    const { req, res } = createMockReqRes({ params: { paperId: 'paper-uuid' } });
    let passedError = null;
    await controller.requestExtraction(req, res, (err) => {
      passedError = err;
    });

    assert.equal(passedError, unexpectedErr);
  });
});

describe('paperAssetController – getExtractionStatus', () => {
  let mockService;
  let controller;

  beforeEach(() => {
    mockService = {
      requestExtraction: async () => ({}),
      getActiveAssets: async () => ({ assets: [], count: 0 }),
      getAssetBinary: async () => ({ asset: {}, filePath: '' }),
      getExtractionStatus: async () => ({}),
    };
    controller = createPaperAssetController(mockService);
  });

  it('maps pending to queued', async () => {
    mockService.getExtractionStatus = async () => ({ status: 'queued', job: { id: 'j1' } });
    const { req, res } = createMockReqRes({ params: { paperId: 'p1' } });
    await controller.getExtractionStatus(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.status, 'queued');
  });

  it('returns not_extracted when no job', async () => {
    mockService.getExtractionStatus = async () => ({ status: 'not_extracted', job: null });
    const { req, res } = createMockReqRes({ params: { paperId: 'p2' } });
    await controller.getExtractionStatus(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.status, 'not_extracted');
    assert.equal(res.jsonPayload.job, null);
  });

  it('forwards unexpected service errors to next(error)', async () => {
    const unexpectedErr = new Error('Database query failure');
    mockService.getExtractionStatus = async () => {
      throw unexpectedErr;
    };

    const { req, res } = createMockReqRes({ params: { paperId: 'p1' } });
    let passedError = null;
    await controller.getExtractionStatus(req, res, (err) => {
      passedError = err;
    });

    assert.equal(passedError, unexpectedErr);
  });
});

describe('paperAssetController – getAsset', () => {
  let mockService;
  let controller;
  const testPaperId = TEST_DIR_NAME;
  const testAssetId = 'asset-sub-uuid';
  const fileName = 'test-image.png';
  const testDir = path.join(TEST_FIXTURE_DIR, testAssetId);
  const filePath = path.join(testDir, fileName);

  beforeEach(() => {
    safeCleanupFixtureDirs();
    mockService = {
      requestExtraction: async () => ({}),
      getActiveAssets: async () => ({ assets: [], count: 0 }),
      getExtractionStatus: async () => ({ status: 'not_extracted', job: null }),
      getAssetBinary: async () => ({ asset: {}, filePath: '' }),
    };
    controller = createPaperAssetController(mockService);

    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(filePath, 'dummypngdata');
  });

  afterEach(() => {
    safeCleanupFixtureDirs();
  });

  it('streams a valid PNG with correct headers and body', async () => {
    const fileSize = fs.statSync(filePath).size;
    mockService.getAssetBinary = async () => ({
      asset: { mime_type: 'image/png', file_size_bytes: fileSize },
      filePath,
    });

    const { req, res } = createMockReqRes({
      params: { paperId: testPaperId, assetId: testAssetId },
    });

    let nextCalled = false;
    await controller.getAsset(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.getHeader('content-type'), 'image/png');
    assert.equal(res.getHeader('content-length'), fileSize);
    assert.equal(res.getHeader('cache-control'), 'private, no-store');
    assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
    const body = Buffer.concat(res.chunks).toString();
    assert.equal(body, 'dummypngdata');
  });

  it('returns 404 when asset is missing in service', async () => {
    mockService.getAssetBinary = async () => {
      throw new PaperAssetError('Asset not found.', 404);
    };

    const { req, res } = createMockReqRes({
      params: { paperId: testPaperId, assetId: 'missing-id' },
    });
    await controller.getAsset(req, res, () => {});

    assert.equal(res.statusCode, 404);
    assert.equal(res.jsonPayload.error, 'Asset not found.');
  });

  it('destroys response when asset stream errors after headers are sent', async () => {
    // Prepare mock service to return a valid asset and filePath
    mockService.getAssetBinary = async () => ({
      asset: { mime_type: 'image/png', file_size_bytes: 10 },
      filePath: 'dummy-path',
    });

    // Save original createReadStream and replace with a faulty stream
    const originalCreateReadStream = fs.createReadStream;
    try {
      // Custom readable that emits a chunk then an error
      fs.createReadStream = () => {
        const stream = new Readable({
          read() {
            this.push('partial'); // emit some data
            this.destroy(new Error('simulated stream error'));
          },
        });
        return stream;
      };

      const { req, res } = createMockReqRes({ params: { paperId: testPaperId, assetId: testAssetId } });
      await controller.getAsset(req, res, () => {});

      // Verify that the response was destroyed after the error
      assert.equal(res.destroyed, true);
    } finally {
      // Restore original function
      fs.createReadStream = originalCreateReadStream;
    }
  });

  it('rejects unsupported MIME types', async () => {
    mockService.getAssetBinary = async () => ({
      asset: { mime_type: 'application/pdf', file_size_bytes: fs.statSync(filePath).size },
      filePath,
    });

    const { req, res } = createMockReqRes({
      params: { paperId: testPaperId, assetId: testAssetId },
    });
    await controller.getAsset(req, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.ok(res.jsonPayload.error.includes('MIME type not allowed'));
  });

  it('forwards unexpected service errors to next(error)', async () => {
    const unexpectedErr = new Error('Disk read failure');
    mockService.getAssetBinary = async () => {
      throw unexpectedErr;
    };

    const { req, res } = createMockReqRes({
      params: { paperId: testPaperId, assetId: testAssetId },
    });
    let passedError = null;
    await controller.getAsset(req, res, (err) => {
      passedError = err;
    });

    assert.equal(passedError, unexpectedErr);
  });
});
