/**
 * assetStagingManager.js
 *
 * FR-09 Stage 3: Job-Scoped Asset Staging Manager.
 *
 * Resolves Finding L-2: Partial output files remain after extraction failure.
 *
 * Provides isolated temporary filesystem staging during extraction jobs.
 * Assets are staged under: uploads/assets/.staging/<jobId>/<attemptId>/
 * On successful extraction completion, assets can be promoted to canonical storage.
 * On failure or abort, the staging directory is completely and safely unlinked.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Standard PNG magic signature: 0x89 0x50 0x4e 0x47 0x0d 0x0a 0x1a 0x0a
 */
export const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Standard JPEG SOI (Start of Image) marker: 0xFF 0xD8
 */
export const JPEG_SOI_MAGIC = Buffer.from([0xff, 0xd8]);

/**
 * Standard JPEG EOI (End of Image) marker: 0xFF 0xD9
 */
export const JPEG_EOI_MAGIC = Buffer.from([0xff, 0xd9]);

/**
 * Minimum sensible size for a valid standalone JPEG image file in bytes.
 * A JPEG requires SOI (2 bytes) + SOF0/APP0 markers and quantization tables (~60-100+ bytes) + EOI (2 bytes).
 */
export const MIN_JPEG_SIZE = 100;

/**
 * Minimum byte length required for a valid PNG file containing the signature and complete IHDR chunk:
 * 8 (signature) + 4 (IHDR length) + 4 ("IHDR") + 13 (IHDR data) + 4 (CRC) = 33 bytes.
 */
export const MIN_PNG_IHDR_SIZE = 33;

/**
 * Default base directory for staging assets.
 */
export const DEFAULT_STAGING_BASE_DIR = path.resolve(process.cwd(), "uploads/assets/.staging");

/**
 * Custom error class for staging manager operations.
 */
export class AssetStagingError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AssetStagingError";
    this.code = options.code || "ASSET_STAGING_ERROR";
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Asserts that an identifier is safe for path interpolation (prevents directory traversal).
 *
 * @param {string|number} id
 * @param {string} label
 * @returns {string} Sanitized string identifier
 */
export function assertSafeId(id, label) {
  if (id === undefined || id === null) {
    throw new AssetStagingError(`Invalid ${label}: identifier cannot be null or undefined`, {
      code: "INVALID_IDENTIFIER",
    });
  }

  const strId = String(id).trim();
  if (!strId || strId === "." || strId === ".." || !/^[a-zA-Z0-9_-]+$/.test(strId)) {
    throw new AssetStagingError(
      `Unsafe or invalid ${label}: "${id}". Only alphanumeric characters, dashes, and underscores are permitted.`,
      { code: "ILLEGAL_IDENTIFIER_CHARACTERS" }
    );
  }

  return strId;
}

/**
 * Asserts that a filename is safe for writing inside a staging directory.
 *
 * @param {string} filename
 * @returns {string} Sanitized filename
 */
export function assertSafeFilename(filename) {
  if (!filename || typeof filename !== "string") {
    throw new AssetStagingError("Invalid filename: must be a non-empty string", {
      code: "INVALID_FILENAME",
    });
  }

  const clean = filename.trim();
  if (clean === "." || clean === ".." || path.basename(clean) !== clean || !/^[a-zA-Z0-9_.-]+$/.test(clean)) {
    throw new AssetStagingError(
      `Unsafe or invalid filename: "${filename}". Path traversal and invalid characters are forbidden.`,
      { code: "ILLEGAL_FILENAME_CHARACTERS" }
    );
  }

  return clean;
}

/**
 * Resolves the canonical path for an attempt's staging directory.
 * Fails closed if any path traversal or unsafe component is detected.
 *
 * @param {string|number} jobId
 * @param {string|number} attemptId
 * @param {string} [customBaseDir] - Optional override for base directory (useful for tests)
 * @returns {string} Absolute path to the staging directory
 */
export function resolveStagingDir(jobId, attemptId, customBaseDir) {
  const safeJobId = assertSafeId(jobId, "jobId");
  const safeAttemptId = assertSafeId(attemptId, "attemptId");
  const baseDir = path.resolve(customBaseDir || DEFAULT_STAGING_BASE_DIR);
  const targetDir = path.resolve(baseDir, safeJobId, safeAttemptId);

  // Guard against traversal escapes
  const expectedPrefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (!targetDir.startsWith(expectedPrefix)) {
    throw new AssetStagingError("Path traversal detected during staging directory resolution", {
      code: "PATH_TRAVERSAL_DETECTED",
    });
  }

  return targetDir;
}

/**
 * Creates the staging directory recursively.
 *
 * @param {string|number} jobId
 * @param {string|number} attemptId
 * @param {string} [customBaseDir]
 * @returns {Promise<string>} Created staging directory path
 */
export async function createStagingDirectory(jobId, attemptId, customBaseDir) {
  const stagingDir = resolveStagingDir(jobId, attemptId, customBaseDir);
  await fs.promises.mkdir(stagingDir, { recursive: true });
  return stagingDir;
}

/**
 * Writes a buffer into the staging directory and validates the write.
 *
 * @param {object} params
 * @param {string|number} params.jobId
 * @param {string|number} params.attemptId
 * @param {string} params.filename
 * @param {Buffer} params.buffer
 * @param {object} [params.metadata]
 * @param {string} [params.customBaseDir]
 * @returns {Promise<object>} Staged asset descriptor
 */
export async function writeStagedAsset({
  jobId,
  attemptId,
  filename,
  buffer,
  metadata = {},
  customBaseDir,
}) {
  const safeFilename = assertSafeFilename(filename);

  if (!buffer || !(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array) || buffer.length === 0) {
    throw new AssetStagingError(`Cannot write empty or invalid buffer for staged file: ${filename}`, {
      code: "EMPTY_BUFFER",
    });
  }

  const stagingDir = await createStagingDirectory(jobId, attemptId, customBaseDir);
  const filePath = path.resolve(stagingDir, safeFilename);

  // Prefix fence check
  const expectedPrefix = stagingDir.endsWith(path.sep) ? stagingDir : stagingDir + path.sep;
  if (!filePath.startsWith(expectedPrefix)) {
    throw new AssetStagingError("Path traversal detected during file write", {
      code: "PATH_TRAVERSAL_DETECTED",
    });
  }

  await fs.promises.writeFile(filePath, buffer);

  return {
    jobId: String(jobId),
    attemptId: String(attemptId),
    filename: safeFilename,
    filePath,
    size: buffer.length,
    ...metadata,
  };
}

/**
 * Validates a staged asset file's integrity and format signature.
 *
 * @param {string} filePath - Absolute path to the staged file
 * @param {string} [expectedFormat] - Expected format: 'png' or 'jpeg'
 * @returns {Promise<object>} Validation report { valid: true, format, size, width?, height? }
 */
export async function validateStagedAsset(filePath, expectedFormat) {
  if (!filePath || typeof filePath !== "string") {
    throw new AssetStagingError("File path is required for asset validation", {
      code: "INVALID_FILE_PATH",
    });
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (err) {
    throw new AssetStagingError(`Staged asset does not exist or cannot be accessed: ${filePath}`, {
      code: "FILE_NOT_FOUND",
      cause: err,
    });
  }

  if (stat.size === 0) {
    throw new AssetStagingError(`Staged asset is empty (0 bytes): ${filePath}`, {
      code: "EMPTY_FILE",
    });
  }

  // Open file for read
  const fd = await fs.promises.open(filePath, "r");
  let headerBuf;
  let tailBuf = null;
  try {
    // Read up to MIN_PNG_IHDR_SIZE (33 bytes) for PNG header + IHDR inspection
    headerBuf = Buffer.alloc(Math.min(stat.size, MIN_PNG_IHDR_SIZE));
    await fd.read(headerBuf, 0, headerBuf.length, 0);

    // Read last 2 bytes for JPEG EOI inspection if file is large enough
    if (stat.size >= 2) {
      tailBuf = Buffer.alloc(2);
      await fd.read(tailBuf, 0, 2, stat.size - 2);
    }
  } finally {
    await fd.close();
  }

  const isPngSignature = headerBuf.length >= 8 && headerBuf.subarray(0, 8).equals(PNG_MAGIC);
  const isJpegSignature = headerBuf.length >= 2 && headerBuf.subarray(0, 2).equals(JPEG_SOI_MAGIC);

  if (expectedFormat === "png" && !isPngSignature) {
    throw new AssetStagingError(`File is not a valid PNG image: ${filePath}`, {
      code: "INVALID_PNG_SIGNATURE",
    });
  }

  if ((expectedFormat === "jpeg" || expectedFormat === "jpg") && !isJpegSignature) {
    throw new AssetStagingError(`File is not a valid JPEG image: ${filePath}`, {
      code: "INVALID_JPEG_SIGNATURE",
    });
  }

  if (!isPngSignature && !isJpegSignature) {
    throw new AssetStagingError(`File does not match supported image format signatures (PNG/JPEG): ${filePath}`, {
      code: "UNRECOGNIZED_IMAGE_FORMAT",
    });
  }

  // PNG deep validation
  if (isPngSignature && (expectedFormat === "png" || !expectedFormat)) {
    // 1. File must be at least MIN_PNG_IHDR_SIZE (33 bytes) to hold signature and complete IHDR chunk
    if (stat.size < MIN_PNG_IHDR_SIZE) {
      throw new AssetStagingError(
        `PNG file too short (${stat.size} bytes): expected at least ${MIN_PNG_IHDR_SIZE} bytes for signature and complete IHDR chunk: ${filePath}`,
        { code: "INVALID_PNG_IHDR" }
      );
    }

    // 2. IHDR chunk length field (bytes 8..12) must be exactly 13 bytes
    const ihdrLength = headerBuf.readUInt32BE(8);
    if (ihdrLength !== 13) {
      throw new AssetStagingError(
        `Invalid PNG IHDR chunk length (${ihdrLength}): expected exactly 13: ${filePath}`,
        { code: "INVALID_PNG_IHDR" }
      );
    }

    // 3. First chunk type (bytes 12..16) must be "IHDR"
    const chunkType = headerBuf.subarray(12, 16).toString("ascii");
    if (chunkType !== "IHDR") {
      throw new AssetStagingError(
        `First PNG chunk must be IHDR, found "${chunkType}": ${filePath}`,
        { code: "INVALID_PNG_IHDR" }
      );
    }

    // 4. Width (bytes 16..20) and height (bytes 20..24) must be positive integers
    const width = headerBuf.readUInt32BE(16);
    const height = headerBuf.readUInt32BE(20);
    if (width <= 0 || height <= 0) {
      throw new AssetStagingError(
        `Invalid PNG dimensions: width=${width}, height=${height}. Both must be positive integers: ${filePath}`,
        { code: "INVALID_PNG_IHDR" }
      );
    }

    return {
      valid: true,
      format: "png",
      size: stat.size,
      width,
      height,
    };
  }

  // JPEG validation:
  // Proportionate heuristic validation (verifies SOI, EOI, and minimum file size)
  // without performing complete Huffman/DCT decompression.
  if (isJpegSignature && (expectedFormat === "jpeg" || expectedFormat === "jpg" || !expectedFormat)) {
    if (stat.size < MIN_JPEG_SIZE) {
      throw new AssetStagingError(
        `JPEG file too short (${stat.size} bytes): minimum valid JPEG size is ${MIN_JPEG_SIZE} bytes: ${filePath}`,
        { code: "FILE_TOO_SHORT" }
      );
    }

    if (!tailBuf || !tailBuf.equals(JPEG_EOI_MAGIC)) {
      throw new AssetStagingError(
        `Invalid JPEG end of image marker (EOI): file may be truncated or corrupted: ${filePath}`,
        { code: "INVALID_JPEG_SIGNATURE" }
      );
    }

    return {
      valid: true,
      format: "jpeg",
      size: stat.size,
    };
  }

  throw new AssetStagingError(`Unrecognized image format: ${filePath}`, {
    code: "UNRECOGNIZED_IMAGE_FORMAT",
  });
}

/**
 * Lists all assets currently staged for a job attempt.
 *
 * @param {string|number} jobId
 * @param {string|number} attemptId
 * @param {string} [customBaseDir]
 * @returns {Promise<Array<object>>} List of staged file descriptors
 */
export async function listStagedAssets(jobId, attemptId, customBaseDir) {
  let stagingDir;
  try {
    stagingDir = resolveStagingDir(jobId, attemptId, customBaseDir);
  } catch {
    return [];
  }

  try {
    const entries = await fs.promises.readdir(stagingDir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.resolve(stagingDir, entry.name);
        const stat = await fs.promises.stat(filePath);
        results.push({
          filename: entry.name,
          filePath,
          size: stat.size,
          mtime: stat.mtime,
        });
      }
    }

    return results;
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw new AssetStagingError(`Failed to list staged assets in ${stagingDir}`, {
      code: "LIST_DIR_ERROR",
      cause: err,
    });
  }
}

/**
 * Safely removes a job attempt's staging directory and all staged files within it.
 * Guarantees that neither the root staging folder nor any parent folder is removed.
 *
 * @param {string|number} jobId
 * @param {string|number} attemptId
 * @param {string} [customBaseDir]
 * @returns {Promise<boolean>} True if directory was cleaned
 */
export async function cleanStagingDirectory(jobId, attemptId, customBaseDir) {
  const safeJobId = assertSafeId(jobId, "jobId");
  const safeAttemptId = assertSafeId(attemptId, "attemptId");
  const baseDir = path.resolve(customBaseDir || DEFAULT_STAGING_BASE_DIR);
  const stagingDir = path.resolve(baseDir, safeJobId, safeAttemptId);

  // Critical safety check: stagingDir must be strictly nested inside baseDir
  const expectedPrefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (!stagingDir.startsWith(expectedPrefix) || stagingDir === baseDir) {
    throw new AssetStagingError("Safety violation: attempted to clean outside of staging hierarchy", {
      code: "UNSAFE_CLEAN_TARGET",
    });
  }

  try {
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return true;
    }
    throw new AssetStagingError(`Failed to clean staging directory: ${stagingDir}`, {
      code: "CLEAN_DIR_ERROR",
      cause: err,
    });
  }
}

