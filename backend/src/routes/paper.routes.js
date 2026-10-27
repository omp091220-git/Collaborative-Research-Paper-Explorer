/**
 * paper.routes.js
 *
 * Defines all /api/papers endpoints and wires middleware.
 *
 * Responsibilities of this file:
 *   - Multer storage/filter configuration (infrastructure config, not logic).
 *   - Route definitions and middleware ordering.
 *   - Delegating all request handling to paper.controller.js.
 *
 * All business logic, metadata extraction, and DB access live in:
 *   paper.service.js     — business logic
 *   paper.repository.js  — DB queries
 *   paper.controller.js  — HTTP handling
 *
 * This follows the same architectural pattern as auth.routes.js +
 * auth.controller.js used by the rest of the project.
 */

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";

import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeRoles, requirePermission } from "../middleware/authorize.js";
import { ROLES, PERMISSIONS } from "../utils/roles.js";

import {
  listPapers,
  getPaperById,
  uploadPaper,
  importPaper,
} from "../controllers/paper.controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MAX_FILE_SIZE = 31_457_280; // 30 MiB

const ALL_ROLES = [ROLES.SYSTEM_ADMIN, ROLES.RESEARCHER, ROLES.STUDENT];
const UPLOAD_ROLES = [ROLES.SYSTEM_ADMIN, ROLES.RESEARCHER];

// ─── Upload directory ─────────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Multer configuration ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    // Sanitise: strip path traversal, use only a generated basename.
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req, file, cb) => {
  // Reject by client-reported MIME type (secondary check — magic bytes are authoritative).
  if (file.mimetype !== "application/pdf") {
    const err = new Error("Only PDF files are accepted.");
    err.statusCode = 415;
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// ─── Multer error wrapper ─────────────────────────────────────────────────────
// Intercepts multer-specific errors before passing control to the controller.
const handleMulterUpload = (req, res, next) => {
  upload.single("pdf")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({ error: "File exceeds the 30 MB size limit." });
      }
      if (err.statusCode === 415) {
        return res.status(415).json({ error: err.message });
      }
      return res
        .status(400)
        .json({ error: err.message || "File upload error." });
    }
    next();
  });
};

// ─── Drain-body middleware (FR-06 connection fix) ─────────────────────────────
// Ensures the request body is fully consumed before responding, preventing
// connection-reset errors when multer rejects early (e.g. wrong MIME type).
const drainBody = (req, res, next) => {
  const origEnd = res.end;
  res.end = function (...args) {
    if (!req.complete) {
      req.on("data", () => {});
      const finish = () => origEnd.apply(this, args);
      req.once("end", finish);
      req.once("error", finish);
      req.resume();
      return;
    }
    return origEnd.apply(this, args);
  };
  next();
};

// =============================================================================
// ROUTES
// =============================================================================

// ─── GET /api/papers ──────────────────────────────────────────────────────────
router.get(
  "/",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  listPapers
);

// ─── GET /api/papers/:id ──────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  getPaperById
);

// ─── POST /api/papers/upload ──────────────────────────────────────────────────
router.post(
  "/upload",
  drainBody,
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  requirePermission(PERMISSIONS.PAPERS_UPLOAD),
  handleMulterUpload,
  uploadPaper
);

// ─── POST /api/papers/import ──────────────────────────────────────────────────
router.post(
  "/import",
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  requirePermission(PERMISSIONS.PAPERS_UPLOAD),
  importPaper
);

export default router;
