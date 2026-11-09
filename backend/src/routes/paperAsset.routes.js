/**
 * paperAsset.routes.js
 *
 * Express routing layer for paper visual asset endpoints and extraction job management.
 * Mounted at: /api/papers/:paperId
 * Uses mergeParams: true to access :paperId.
 *
 * Endpoints:
 * - GET  /api/papers/:paperId/assets             (requirePaperView)
 * - GET  /api/papers/:paperId/assets/:assetId    (requirePaperView)
 * - GET  /api/papers/:paperId/extraction-status  (requirePaperView)
 * - POST /api/papers/:paperId/extract            (requirePaperEdit)
 */

import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  requirePaperView,
  requirePaperEdit,
} from "../middleware/paperAccess.js";
import {
  listAssets,
  getAsset,
  getExtractionStatus,
  requestExtraction,
} from "../controllers/paperAsset.controller.js";

const router = express.Router({ mergeParams: true });

// ─── Visual Asset Endpoints ──────────────────────────────────────────────────

// GET /api/papers/:paperId/assets - List active visual assets for paper
router.get("/assets", authenticateToken, requirePaperView, listAssets);

// GET /api/papers/:paperId/assets/:assetId - Serve visual asset binary
router.get("/assets/:assetId", authenticateToken, requirePaperView, getAsset);

// ─── Extraction Job Management Endpoints ─────────────────────────────────────

// GET /api/papers/:paperId/extraction-status - Check current/latest extraction status
router.get("/extraction-status", authenticateToken, requirePaperView, getExtractionStatus);

// POST /api/papers/:paperId/extract - Trigger re-extraction job
router.post("/extract", authenticateToken, requirePaperEdit, requestExtraction);

export default router;

