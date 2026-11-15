/**
 * paperAsset.service.js
 *
 * Business logic layer for paper asset management and extraction job orchestration.
 * Updated to fix API contract and streaming security issues (Phase 3.4.1.2).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as paperAssetRepo from "../repositories/paperAsset.repository.js";
import * as extractionJobRepo from "../repositories/extractionJob.repository.js";

// Internal references that can be overridden for testing
let paperAssetRepoInternal = paperAssetRepo;
let extractionJobRepoInternal = extractionJobRepo;

/**
 * Allows test code to replace repository implementations.
 * @param {object} repos - Object with optional extractionJobRepo and paperAssetRepo.
 */
export function __setRepositories({ extractionJobRepo: ejRepo, paperAssetRepo: paRepo } = {}) {
  if (ejRepo) extractionJobRepoInternal = ejRepo;
  if (paRepo) paperAssetRepoInternal = paRepo;
}

import { isValidUUID } from "../middleware/paperAccess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root and base directory for assets storage
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const ASSETS_BASE_DIR = path.resolve(PROJECT_ROOT, "uploads/assets");

/**
 * Custom error class with HTTP status code support.
 */
export class PaperAssetError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PaperAssetError";
    this.statusCode = statusCode;
  }
}

/**
 * Validates asset type filter if provided.
 */
function validateAssetType(assetType) {
  if (assetType && !["figure", "chart", "table"].includes(assetType)) {
    throw new PaperAssetError(
      "Invalid asset_type filter. Must be 'figure', 'chart', or 'table'.",
      400
    );
  }
}

/**
 * Helper to strip internal/secure fields from a job row before returning it to the client.
 */
function sanitizeJob(job) {
  if (!job) return null;
  const {
    lease_token,
    locked_by,
    lease_expires_at,
    error_message,
    started_at,
    ...publicFields
  } = job;
  return publicFields;
}

/**
 * Retrieves all active visual assets for a paper.
 */
export async function getActiveAssets(paperId, { assetType } = {}) {
  if (!isValidUUID(paperId)) {
    throw new PaperAssetError("Invalid paper ID format. Must be a valid UUID.", 400);
  }

  validateAssetType(assetType);

  const assets = await paperAssetRepoInternal.findActiveAssetsByPaperId(paperId, { assetType });
  return {
    assets,
    count: assets.length,
  };
}

/**
 * Checks the status of extraction jobs for a paper.
 */
export async function getExtractionStatus(paperId) {
  if (!isValidUUID(paperId)) {
    throw new PaperAssetError("Invalid paper ID format. Must be a valid UUID.", 400);
  }

  const latestJob = await extractionJobRepo.findLatestJobByPaperId(paperId);
  if (!latestJob) {
    return {
      status: "not_extracted",
      message: "No extraction has been initiated for this paper.",
      job: null,
    };
  }

  // Map internal status to public API status
  let publicStatus = latestJob.status;
  if (publicStatus === "pending") publicStatus = "queued";

  return {
    status: publicStatus,
    job: sanitizeJob({ ...latestJob, status: publicStatus }),
  };
}

/**
 * Requests or re‑triggers extraction for a paper.
 * Returns the job and a flag indicating whether it already existed.
 */
export async function requestExtraction(paperId) {
  if (!isValidUUID(paperId)) {
    throw new PaperAssetError("Invalid paper ID format. Must be a valid UUID.", 400);
  }

  // First, look for any existing job (including completed/failed)
  const latestJob = await extractionJobRepo.findLatestJobByPaperId(paperId);
  if (latestJob) {
    // Return the existing job – map pending to queued for public view
    const publicStatus = latestJob.status === "pending" ? "queued" : latestJob.status;
    return { job: sanitizeJob({ ...latestJob, status: publicStatus }), alreadyExists: true };
  }

  // No job exists – attempt to create a new one
  try {
    const job = await extractionJobRepo.createExtractionJob(null, {
      paperId,
      maxAttempts: 3,
    });
    return { job: sanitizeJob(job), alreadyExists: false };
  } catch (error) {
    // Handle race condition where another request created the job first
    if (
      error.code === "23505" &&
      (error.constraint === "uq_one_active_extraction_job_per_paper" ||
        (error.message && error.message.includes("uq_one_active_extraction_job_per_paper")))
    ) {
      // Fetch the job that won the race
      const activeJob = await extractionJobRepo.findActiveJobByPaperId(paperId);
      if (activeJob) {
        const publicStatus = activeJob.status === "pending" ? "queued" : activeJob.status;
        return { job: sanitizeJob({ ...activeJob, status: publicStatus }), alreadyExists: true };
      }
    }
    // Propagate unexpected errors
    throw error;
  }
}

/**
 * Retrieves asset metadata and resolves verified binary path on disk.
 */
export async function getAssetBinary(paperId, assetId) {
  if (!isValidUUID(paperId)) {
    throw new PaperAssetError("Invalid paper ID format. Must be a valid UUID.", 400);
  }
  if (!isValidUUID(assetId)) {
    throw new PaperAssetError("Invalid asset ID format. Must be a valid UUID.", 400);
  }

  const asset = await paperAssetRepo.findAssetById(paperId, assetId);
  if (!asset) {
    throw new PaperAssetError("Asset not found.", 404);
  }

  const filePath = resolveAssetFilePath(asset);
  return { asset, filePath };
}

/**
 * Resolves and verifies the canonical absolute filesystem path for an asset.
 */
export function resolveAssetFilePath(asset) {
  if (!asset || !asset.file_path || typeof asset.file_path !== "string") {
    throw new PaperAssetError("Invalid asset record: file path missing.", 500);
  }

  // Normalise paths against project root
  const candidatePath = path.resolve(PROJECT_ROOT, asset.file_path);

  // File must exist on disk
  if (!fs.existsSync(candidatePath)) {
    throw new PaperAssetError("Asset file not found on disk.", 404);
  }

  // Resolve symbolic links for canonical boundary verification
  const canonicalCandidate = fs.realpathSync(candidatePath);

  // Ensure assets directory exists for canonical path checking
  if (!fs.existsSync(ASSETS_BASE_DIR)) {
    fs.mkdirSync(ASSETS_BASE_DIR, { recursive: true });
  }
  const canonicalAssetsBase = fs.realpathSync(ASSETS_BASE_DIR);

  // Path must reside strictly inside canonicalAssetsBase (platform‑aware comparison)
  const targetPath = process.platform === "win32" ? canonicalCandidate.toLowerCase() : canonicalCandidate;
  const basePath =
    process.platform === "win32"
      ? (canonicalAssetsBase + path.sep).toLowerCase()
      : canonicalAssetsBase + path.sep;

  const isContained = targetPath.startsWith(basePath);
  if (!isContained) {
    throw new PaperAssetError("Access denied: asset path is outside designated directory.", 403);
  }

  return canonicalCandidate;
}
