/**
 * assetStagingManager.test.js
 *
 * Dedicated unit tests for FR-09 Stage 3 Asset Staging Manager:
 * 1. assertSafeId and assertSafeFilename: Strict input validation and traversal rejection.
 * 2. resolveStagingDir: Path fencing and canonical resolution.
 * 3. createStagingDirectory & writeStagedAsset: Staged writing with atomic descriptors.
 * 4. validateStagedAsset: PNG and JPEG signature validation, IHDR chunk dimension reading, empty file detection.
 * 5. listStagedAssets: Directory inspection and metadata reporting.
 * 6. cleanStagingDirectory: Scoped cleanup without touching parent or sibling directories (Resolves Finding L-2).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertSafeId,
  assertSafeFilename,
  resolveStagingDir,
  createStagingDirectory,
  writeStagedAsset,
  validateStagedAsset,
  listStagedAssets,
  cleanStagingDirectory,
  AssetStagingError,
  PNG_MAGIC,
  JPEG_SOI_MAGIC,
  JPEG_EOI_MAGIC,
  MIN_JPEG_SIZE,
  MIN_PNG_IHDR_SIZE,
} from "../utils/assetStagingManager.js";

describe("FR-09 Stage 3: Asset Staging Manager (Resolves Finding L-2)", () => {
  let testBaseDir;

  beforeEach(async () => {
    testBaseDir = path.resolve(
      os.tmpdir(),
      `crp_test_staging_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    await fs.promises.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("assertSafeId and assertSafeFilename", () => {
    it("accepts valid alphanumeric, dashed, and underscored IDs", () => {
      assert.strictEqual(assertSafeId("job-123_abc", "jobId"), "job-123_abc");
      assert.strictEqual(assertSafeId(42, "jobId"), "42");
      assert.strictEqual(assertSafeFilename("figure_p1_1.png"), "figure_p1_1.png");
    });

    it("rejects path traversal and illegal characters in IDs", () => {
      const unsafeIds = ["..", "../etc", "job/12", "job\\12", "", "   ", "job;rm"];
      for (const unsafe of unsafeIds) {
        assert.throws(
          () => assertSafeId(unsafe, "jobId"),
          (err) => err instanceof AssetStagingError
        );
      }
    });

    it("rejects path traversal and forbidden characters in filenames", () => {
      const unsafeFilenames = ["..", "../hack.png", "sub/hack.png", "sub\\hack.png", "", "foo bar.png?"];
      for (const unsafe of unsafeFilenames) {
        assert.throws(
          () => assertSafeFilename(unsafe),
          (err) => err instanceof AssetStagingError
        );
      }
    });
  });

  describe("resolveStagingDir", () => {
    it("resolves canonical nested path within customBaseDir", () => {
      const dir = resolveStagingDir("job_1", "att_1", testBaseDir);
      const expected = path.resolve(testBaseDir, "job_1", "att_1");
      assert.strictEqual(dir, expected);
    });

    it("prevents directory traversal attempts", () => {
      assert.throws(
        () => resolveStagingDir("../job", "att_1", testBaseDir),
        (err) => err instanceof AssetStagingError
      );
    });
  });

  describe("writeStagedAsset & createStagingDirectory", () => {
    it("creates directory and writes asset buffer", async () => {
      const mockBuffer = Buffer.from("mock_image_bytes");
      const descriptor = await writeStagedAsset({
        jobId: "job-001",
        attemptId: "att-001",
        filename: "figure_p1_1.png",
        buffer: mockBuffer,
        metadata: { pageNumber: 1, assetType: "figure" },
        customBaseDir: testBaseDir,
      });

      assert.strictEqual(descriptor.jobId, "job-001");
      assert.strictEqual(descriptor.attemptId, "att-001");
      assert.strictEqual(descriptor.filename, "figure_p1_1.png");
      assert.strictEqual(descriptor.size, mockBuffer.length);
      assert.strictEqual(descriptor.pageNumber, 1);
      assert.strictEqual(descriptor.assetType, "figure");

      // Verify file exists on disk
      const stat = await fs.promises.stat(descriptor.filePath);
      assert.strictEqual(stat.size, mockBuffer.length);
    });

    it("rejects empty buffers", async () => {
      await assert.rejects(
        () =>
          writeStagedAsset({
            jobId: "job-001",
            attemptId: "att-001",
            filename: "empty.png",
            buffer: Buffer.alloc(0),
            customBaseDir: testBaseDir,
          }),
        (err) => err instanceof AssetStagingError && err.code === "EMPTY_BUFFER"
      );
    });
  });

  describe("validateStagedAsset", () => {
    function makePngBuffer({ width = 100, height = 50, length = 13, chunkType = "IHDR", totalSize = 33 } = {}) {
      const buf = Buffer.alloc(totalSize);
      PNG_MAGIC.copy(buf, 0);
      if (totalSize >= 12) buf.writeUInt32BE(length, 8);
      if (totalSize >= 16) buf.write(chunkType, 12, 4, "ascii");
      if (totalSize >= 20) buf.writeUInt32BE(width, 16);
      if (totalSize >= 24) buf.writeUInt32BE(height, 20);
      return buf;
    }

    function makeJpegBuffer({ size = 120, startMarker = JPEG_SOI_MAGIC, endMarker = JPEG_EOI_MAGIC } = {}) {
      const buf = Buffer.alloc(size, 0xbb);
      startMarker.copy(buf, 0);
      endMarker.copy(buf, size - 2);
      return buf;
    }

    // --- PNG Validation Tests ---
    it("validates a well-formed PNG and extracts IHDR dimensions", async () => {
      const pngHeader = makePngBuffer({ width: 640, height: 480 });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-1",
        filename: "valid.png",
        buffer: pngHeader,
        customBaseDir: testBaseDir,
      });

      const report = await validateStagedAsset(staged.filePath, "png");
      assert.strictEqual(report.valid, true);
      assert.strictEqual(report.format, "png");
      assert.strictEqual(report.width, 640);
      assert.strictEqual(report.height, 480);
      assert.strictEqual(report.size, 33);
    });

    it("rejects PNG with signature only (missing IHDR)", async () => {
      const sigOnly = Buffer.from(PNG_MAGIC); // 8 bytes
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-2",
        filename: "sig_only.png",
        buffer: sigOnly,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR"
      );
    });

    it("rejects truncated IHDR chunk (< 33 bytes)", async () => {
      const truncated = makePngBuffer({ totalSize: 20 });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-3",
        filename: "truncated.png",
        buffer: truncated,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR"
      );
    });

    it("rejects PNG with wrong first chunk type (not IHDR)", async () => {
      const wrongChunk = makePngBuffer({ chunkType: "PLTE" });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-4",
        filename: "wrong_chunk.png",
        buffer: wrongChunk,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR" && /must be IHDR/.test(err.message)
      );
    });

    it("rejects PNG with incorrect IHDR chunk length field (length !== 13)", async () => {
      const wrongLen = makePngBuffer({ length: 14 });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-5",
        filename: "wrong_len.png",
        buffer: wrongLen,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR" && /expected exactly 13/.test(err.message)
      );
    });

    it("rejects PNG with zero width or zero height", async () => {
      const zeroWidth = makePngBuffer({ width: 0, height: 100 });
      const stagedW = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-6",
        filename: "zero_w.png",
        buffer: zeroWidth,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(stagedW.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR" && /positive integers/.test(err.message)
      );

      const zeroHeight = makePngBuffer({ width: 100, height: 0 });
      const stagedH = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-png-7",
        filename: "zero_h.png",
        buffer: zeroHeight,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(stagedH.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_IHDR" && /positive integers/.test(err.message)
      );
    });

    // --- JPEG Validation Tests ---
    it("validates a JPEG file with SOI and EOI markers and sufficient size", async () => {
      const jpegBuf = makeJpegBuffer({ size: 128 });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-jpg-1",
        filename: "valid.jpg",
        buffer: jpegBuf,
        customBaseDir: testBaseDir,
      });

      const report = await validateStagedAsset(staged.filePath, "jpeg");
      assert.strictEqual(report.valid, true);
      assert.strictEqual(report.format, "jpeg");
      assert.strictEqual(report.size, 128);
    });

    it("rejects two-byte SOI-only file (below MIN_JPEG_SIZE)", async () => {
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-jpg-2",
        filename: "soi_only.jpg",
        buffer: Buffer.from(JPEG_SOI_MAGIC),
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "jpeg"),
        (err) => err instanceof AssetStagingError && err.code === "FILE_TOO_SHORT"
      );
    });

    it("rejects JPEG file below MIN_JPEG_SIZE (< 100 bytes)", async () => {
      const smallBuf = makeJpegBuffer({ size: 50 });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-jpg-3",
        filename: "small.jpg",
        buffer: smallBuf,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "jpeg"),
        (err) => err instanceof AssetStagingError && err.code === "FILE_TOO_SHORT"
      );
    });

    it("rejects truncated JPEG missing EOI marker", async () => {
      // 120 bytes starting with SOI, but ending in 0x00 0x00 instead of EOI (0xFF 0xD9)
      const truncated = makeJpegBuffer({ size: 120, endMarker: Buffer.from([0x00, 0x00]) });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-jpg-4",
        filename: "no_eoi.jpg",
        buffer: truncated,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "jpeg"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_JPEG_SIGNATURE" && /end of image marker/.test(err.message)
      );
    });

    it("rejects file with invalid starting marker for JPEG", async () => {
      const badStart = makeJpegBuffer({ size: 120, startMarker: Buffer.from([0x00, 0x00]) });
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-jpg-5",
        filename: "bad_start.jpg",
        buffer: badStart,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "jpeg"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_JPEG_SIGNATURE"
      );
    });

    it("rejects non-existent, empty, or corrupt files", async () => {
      const corruptBuf = Buffer.from("not_an_image");
      const staged = await writeStagedAsset({
        jobId: "job-val",
        attemptId: "att-gen-1",
        filename: "corrupt.png",
        buffer: corruptBuf,
        customBaseDir: testBaseDir,
      });

      await assert.rejects(
        () => validateStagedAsset(staged.filePath, "png"),
        (err) => err instanceof AssetStagingError && err.code === "INVALID_PNG_SIGNATURE"
      );

      await assert.rejects(
        () => validateStagedAsset(path.resolve(testBaseDir, "ghost.png")),
        (err) => err instanceof AssetStagingError && err.code === "FILE_NOT_FOUND"
      );
    });
  });

  describe("listStagedAssets & cleanStagingDirectory", () => {
    it("lists all staged files for a specific job attempt", async () => {
      await writeStagedAsset({
        jobId: "job-list",
        attemptId: "att-1",
        filename: "file1.png",
        buffer: Buffer.from("buf1"),
        customBaseDir: testBaseDir,
      });
      await writeStagedAsset({
        jobId: "job-list",
        attemptId: "att-1",
        filename: "file2.png",
        buffer: Buffer.from("buf2_longer"),
        customBaseDir: testBaseDir,
      });

      const files = await listStagedAssets("job-list", "att-1", testBaseDir);
      assert.strictEqual(files.length, 2);
      const names = files.map((f) => f.filename).sort();
      assert.deepStrictEqual(names, ["file1.png", "file2.png"]);
    });

    it("returns empty array when listing a non-existent job attempt", async () => {
      const files = await listStagedAssets("non_existent_job", "att-99", testBaseDir);
      assert.deepStrictEqual(files, []);
    });

    it("safely cleans only the target attempt directory and leaves siblings intact", async () => {
      // Staged file in attempt 1
      await writeStagedAsset({
        jobId: "job-clean",
        attemptId: "att-1",
        filename: "asset1.png",
        buffer: Buffer.from("data1"),
        customBaseDir: testBaseDir,
      });

      // Staged file in attempt 2 (sibling)
      await writeStagedAsset({
        jobId: "job-clean",
        attemptId: "att-2",
        filename: "asset2.png",
        buffer: Buffer.from("data2"),
        customBaseDir: testBaseDir,
      });

      // Clean attempt 1
      const cleaned = await cleanStagingDirectory("job-clean", "att-1", testBaseDir);
      assert.strictEqual(cleaned, true);

      // Verify attempt 1 directory is gone
      const att1Files = await listStagedAssets("job-clean", "att-1", testBaseDir);
      assert.strictEqual(att1Files.length, 0);

      // Verify attempt 2 directory and its files remain intact
      const att2Files = await listStagedAssets("job-clean", "att-2", testBaseDir);
      assert.strictEqual(att2Files.length, 1);
      assert.strictEqual(att2Files[0].filename, "asset2.png");

      // Verify parent testBaseDir still exists
      const baseStat = await fs.promises.stat(testBaseDir);
      assert.ok(baseStat.isDirectory());
    });
  });
});

