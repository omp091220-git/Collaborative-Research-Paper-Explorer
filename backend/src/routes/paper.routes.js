import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";
import https from "node:https";
import http from "node:http";
import pool from "../config/database.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeRoles, requirePermission } from "../middleware/authorize.js";
import { ROLES, PERMISSIONS } from "../utils/roles.js";
import { isValidPdf } from "../utils/pdfValidator.js";
import * as paperStarRepo from "../repositories/paperStar.repository.js";
import {
  notifyStarrersMetadataChange,
  notifyMentions,
} from "../services/notification.service.js";

const isValidUUID = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MAX_FILE_SIZE = 31_457_280; // 30 MiB in bytes

const ALL_ROLES = [ROLES.SYSTEM_ADMIN, ROLES.RESEARCHER, ROLES.STUDENT];
const UPLOAD_ROLES = [ROLES.SYSTEM_ADMIN, ROLES.RESEARCHER];

// ─── Upload directory ───────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Multer configuration ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    // Sanitise: strip path traversal, use only a generated basename
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req, file, cb) => {
  // Reject by client-reported MIME type (secondary check — magic bytes are authoritative)
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

// ─── Helper: delete a file safely (best-effort) ─────────────────────────────
function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Helper: extract arXiv ID from various input formats ────────────────────
function parseArxivId(input) {
  if (!input || typeof input !== "string") return null;
  const cleaned = input.trim();
  // Accept bare IDs like "2301.00001" or "2301.00001v2", or full URLs
  const idMatch = cleaned.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/)?([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/i
  );
  return idMatch ? idMatch[1] : null;
}

// ─── Helper: download arXiv PDF ──────────────────────────────────────────────
async function downloadArxivPdf(arxivId, destPath) {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  return new Promise((resolve, reject) => {
    const doRequest = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        return reject(new Error("Too many redirects while downloading PDF."));
      }
      const mod = url.startsWith("https") ? https : http;
      const req = mod.get(url, { timeout: 30_000 }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const location = res.headers["location"];
          res.resume();
          if (!location)
            return reject(new Error("Redirect without location header."));
          return doRequest(location, redirectCount + 1);
        }
        if (res.statusCode === 404) {
          res.resume();
          return reject(
            Object.assign(new Error("PDF not found on arXiv."), {
              statusCode: 404,
            })
          );
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            Object.assign(
              new Error(`arXiv responded with status ${res.statusCode}.`),
              { statusCode: 502 }
            )
          );
        }

        let downloaded = 0;
        const fileStream = fs.createWriteStream(destPath);
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (downloaded > MAX_FILE_SIZE) {
            req.destroy();
            fileStream.destroy();
            safeUnlink(destPath);
            return reject(
              Object.assign(
                new Error("PDF exceeds the 30 MiB size limit."),
                { statusCode: 413 }
              )
            );
          }
        });
        res.pipe(fileStream);
        fileStream.on("finish", () => resolve(downloaded));
        fileStream.on("error", (err) => {
          safeUnlink(destPath);
          reject(err);
        });
      });
      req.on("error", (err) => {
        safeUnlink(destPath);
        reject(Object.assign(err, { statusCode: 503 }));
      });
      req.on("timeout", () => {
        req.destroy();
        safeUnlink(destPath);
        reject(
          Object.assign(
            new Error("Request timed out while downloading PDF from arXiv."),
            { statusCode: 504 }
          )
        );
      });
    };
    doRequest(pdfUrl);
  });
}

// ─── Helper: fetch arXiv metadata via public Atom API ────────────────────────
async function fetchArxivMetadata(arxivId) {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
  return new Promise((resolve, reject) => {
    https
      .get(apiUrl, { timeout: 15_000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(
              Object.assign(
                new Error(`arXiv API error: ${res.statusCode}`),
                { statusCode: 502 }
              )
            );
          }
          // Check total results
          const totalMatch = data.match(
            /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/
          );
          const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
          if (total === 0) {
            return reject(
              Object.assign(
                new Error(`No paper found for arXiv ID: ${arxivId}`),
                { statusCode: 404 }
              )
            );
          }

          // Parse XML without an xml2js dependency
          // The feed title is first; the paper title is the second <title>
          const titles = [...data.matchAll(/<title>([\s\S]*?)<\/title>/g)];
          const paperTitle = titles[1]
            ? titles[1][1].trim().replace(/\s+/g, " ")
            : arxivId;

          const abstractMatch = data.match(
            /<summary>([\s\S]*?)<\/summary>/
          );
          const abstract = abstractMatch
            ? abstractMatch[1].trim().replace(/\s+/g, " ")
            : null;

          // Parse authors
          const authorMatches = [
            ...data.matchAll(/<author>([\s\S]*?)<\/author>/g),
          ];
          const authors = authorMatches
            .map((m) => {
              const nameMatch = m[1].match(/<name>([\s\S]*?)<\/name>/);
              return nameMatch ? nameMatch[1].trim() : "";
            })
            .filter(Boolean);

          resolve({
            title: paperTitle,
            abstract,
            authors: authors.length > 0 ? authors : ["Unknown Author"],
          });
        });
        res.on("error", (err) =>
          reject(Object.assign(err, { statusCode: 503 }))
        );
      })
      .on("error", (err) =>
        reject(Object.assign(err, { statusCode: 503 }))
      )
      .on("timeout", function () {
        this.destroy();
        reject(
          Object.assign(
            new Error("Timed out fetching arXiv metadata."),
            { statusCode: 504 }
          )
        );
      });
  });
}

// =============================================================================
// ROUTES
// =============================================================================

// ─── GET /api/papers ────────────────────────────────────────────────────────
// All three authenticated roles (STUDENT, RESEARCHER, SYSTEM_ADMIN) can view papers.
router.get(
  "/",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      let papers = [];
      try {
        const result = await pool.query(
          `SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id,
                  p.file_size_bytes, p.mime_type,
                  p.uploader_id, p.uploaded_at, p.updated_at,
                  COALESCE(s.star_count, 0)::int AS star_count,
                  COALESCE(us.is_starred, false) AS is_starred
           FROM papers p
           LEFT JOIN (
             SELECT paper_id, COUNT(*)::int AS star_count
             FROM paper_stars
             GROUP BY paper_id
           ) s ON s.paper_id = p.id
           LEFT JOIN (
             SELECT paper_id, true AS is_starred
             FROM paper_stars
             WHERE user_id = $1
           ) us ON us.paper_id = p.id
           ORDER BY p.uploaded_at DESC`,
          [req.user.id]
        );
        papers = result.rows;
      } catch {
        const result = await pool.query(
          `SELECT id, title, abstract, authors, arxiv_id,
                  file_size_bytes, mime_type,
                  uploader_id, uploaded_at, updated_at,
                  0 AS star_count, false AS is_starred
           FROM papers
           ORDER BY uploaded_at DESC`
        );
        papers = result.rows;
      }

      return res.status(200).json({
        papers,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /api/papers/:id ────────────────────────────────────────────────────
// Retrieve a single paper by its UUID.
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      let paper = null;

      try {
        const result = await pool.query(
          `SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id,
                  p.file_size_bytes, p.mime_type,
                  p.uploader_id, p.uploaded_at, p.updated_at,
                  COALESCE(s.star_count, 0)::int AS star_count,
                  COALESCE(us.is_starred, false) AS is_starred
           FROM papers p
           LEFT JOIN (
             SELECT paper_id, COUNT(*)::int AS star_count
             FROM paper_stars
             GROUP BY paper_id
           ) s ON s.paper_id = p.id
           LEFT JOIN (
             SELECT paper_id, true AS is_starred
             FROM paper_stars
             WHERE user_id = $2
           ) us ON us.paper_id = p.id
           WHERE p.id = $1`,
          [id, req.user.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Paper not found." });
        }
        paper = result.rows[0];
      } catch {
        const result = await pool.query(
          `SELECT id, title, abstract, authors, arxiv_id,
                  file_size_bytes, mime_type,
                  uploader_id, uploaded_at, updated_at,
                  0 AS star_count, false AS is_starred
           FROM papers
           WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Paper not found." });
        }
        paper = result.rows[0];
      }

      return res.status(200).json({ paper });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /api/papers/upload ─────────────────────────────────────────────────
// RESEARCHER and SYSTEM_ADMIN can upload PDF papers.
router.post(
  "/upload",
  (req, res, next) => {
    const origEnd = res.end;
    res.end = function (...args) {
      if (!req.complete) {
        req.on("data", () => {});
        const finish = () => {
          origEnd.apply(this, args);
        };
        req.once("end", finish);
        req.once("error", finish);
        req.resume();
        return;
      }
      return origEnd.apply(this, args);
    };
    next();
  },
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  requirePermission(PERMISSIONS.PAPERS_UPLOAD),
  (req, res, next) => {
    // Wrap multer in manual error handling
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
  },
  async (req, res, next) => {
    const uploadedFilePath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No PDF file provided. Include a file field named "pdf".',
        });
      }

      // Validate PDF magic bytes (do not trust client-supplied MIME type)
      const valid = await isValidPdf(uploadedFilePath);
      if (!valid) {
        safeUnlink(uploadedFilePath);
        return res
          .status(415)
          .json({ error: "The uploaded file is not a valid PDF." });
      }

      const { title, abstract, authors } = req.body;

      // Validate required metadata
      if (!title || !title.trim()) {
        safeUnlink(uploadedFilePath);
        return res.status(400).json({ error: "Paper title is required." });
      }

      let parsedAuthors;
      try {
        parsedAuthors =
          typeof authors === "string" ? JSON.parse(authors) : authors;
      } catch {
        parsedAuthors = typeof authors === "string" ? [authors] : [];
      }

      if (!Array.isArray(parsedAuthors) || parsedAuthors.length === 0) {
        safeUnlink(uploadedFilePath);
        return res
          .status(400)
          .json({ error: "At least one author is required." });
      }

      // Store a relative path (portable across deployments)
      const relativeFilePath = path
        .relative(path.resolve(__dirname, "../../.."), uploadedFilePath)
        .replace(/\\/g, "/");

      const result = await pool.query(
        `INSERT INTO papers (title, abstract, authors, file_path, file_size_bytes, mime_type, uploader_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, title, abstract, authors, arxiv_id, file_size_bytes, mime_type, uploader_id, uploaded_at`,
        [
          title.trim(),
          abstract?.trim() || null,
          parsedAuthors,
          relativeFilePath,
          req.file.size,
          "application/pdf",
          req.user.id,
        ]
      );

      return res.status(201).json({
        message: "Paper uploaded successfully.",
        paper: result.rows[0],
      });
    } catch (error) {
      safeUnlink(uploadedFilePath);

      // Unique constraint violation on file_path or arxiv_id
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ error: "This paper already exists in the system." });
      }
      // DB CHECK constraint violation (size, mime, etc.)
      if (error.code === "23514") {
        return res.status(400).json({
          error: "File failed database validation. Check size and type.",
        });
      }

      return next(error);
    }
  }
);

// ─── POST /api/papers/import ─────────────────────────────────────────────────
// RESEARCHER and SYSTEM_ADMIN can import papers by arXiv ID.
router.post(
  "/import",
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  requirePermission(PERMISSIONS.PAPERS_UPLOAD),
  async (req, res, next) => {
    const { arxiv_id: rawId } = req.body;

    if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
      return res.status(400).json({ error: "arxiv_id is required." });
    }

    const arxivId = parseArxivId(rawId.trim());
    if (!arxivId) {
      return res.status(400).json({
        error:
          'Invalid arXiv ID format. Expected e.g. "2301.00001" or "2301.00001v2".',
      });
    }

    // Duplicate check before downloading
    try {
      const existing = await pool.query(
        "SELECT id, title FROM papers WHERE arxiv_id = $1",
        [arxivId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `This paper (arXiv:${arxivId}) is already in the system.`,
          paper: existing.rows[0],
        });
      }
    } catch (error) {
      return next(error);
    }

    // Fetch metadata from arXiv Atom API
    let metadata;
    try {
      metadata = await fetchArxivMetadata(arxivId);
    } catch (err) {
      const status = err.statusCode || 502;
      return res.status(status).json({
        error: err.message || "Failed to fetch paper metadata from arXiv.",
      });
    }

    // Download the PDF
    const safeName = `arxiv-${arxivId.replace(/[^a-z0-9.\-]/gi, "_")}-${Date.now()}.pdf`;
    const destPath = path.join(UPLOADS_DIR, safeName);
    let fileSize;

    try {
      fileSize = await downloadArxivPdf(arxivId, destPath);
    } catch (err) {
      safeUnlink(destPath);
      const status = err.statusCode || 502;
      return res.status(status).json({
        error: err.message || "Failed to download PDF from arXiv.",
      });
    }

    // Validate PDF magic bytes
    const valid = await isValidPdf(destPath);
    if (!valid) {
      safeUnlink(destPath);
      return res
        .status(415)
        .json({ error: "The downloaded file is not a valid PDF." });
    }

    const relativeFilePath = path
      .relative(path.resolve(__dirname, "../../.."), destPath)
      .replace(/\\/g, "/");

    try {
      const result = await pool.query(
        `INSERT INTO papers (title, abstract, authors, arxiv_id, file_path, file_size_bytes, mime_type, uploader_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title, abstract, authors, arxiv_id, file_size_bytes, mime_type, uploader_id, uploaded_at`,
        [
          metadata.title,
          metadata.abstract,
          metadata.authors,
          arxivId,
          relativeFilePath,
          fileSize,
          "application/pdf",
          req.user.id,
        ]
      );

      return res.status(201).json({
        message: `Paper "${metadata.title}" imported from arXiv successfully.`,
        paper: result.rows[0],
      });
    } catch (error) {
      safeUnlink(destPath);

      if (error.code === "23505") {
        return res.status(409).json({
          error: `This paper (arXiv:${arxivId}) is already in the system.`,
        });
      }
      if (error.code === "23514") {
        return res.status(400).json({
          error:
            "Paper failed database validation. Check size and metadata.",
        });
      }

      return next(error);
    }
  }
);

// ─── POST /api/papers/:id/star ───────────────────────────────────────────────
// Star / bookmark a paper for the authenticated user.
router.post(
  "/:id/star",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const paperCheck = await pool.query(
        "SELECT id FROM papers WHERE id = $1",
        [id]
      );
      if (paperCheck.rows.length === 0) {
        return res.status(404).json({ error: "Paper not found." });
      }

      await paperStarRepo.starPaper(req.user.id, id);
      const starCount = await paperStarRepo.getPaperStarCount(id);

      return res.status(200).json({
        message: "Paper starred successfully.",
        is_starred: true,
        star_count: starCount,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── DELETE /api/papers/:id/star ─────────────────────────────────────────────
// Unstar a paper for the authenticated user.
router.delete(
  "/:id/star",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const paperCheck = await pool.query(
        "SELECT id FROM papers WHERE id = $1",
        [id]
      );
      if (paperCheck.rows.length === 0) {
        return res.status(404).json({ error: "Paper not found." });
      }

      await paperStarRepo.unstarPaper(req.user.id, id);
      const starCount = await paperStarRepo.getPaperStarCount(id);

      return res.status(200).json({
        message: "Paper unstarred successfully.",
        is_starred: false,
        star_count: starCount,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /api/papers/:id/star ───────────────────────────────────────────────
// Get star status and total star count for the paper.
router.get(
  "/:id/star",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const isStarred = await paperStarRepo.isPaperStarred(req.user.id, id);
      const starCount = await paperStarRepo.getPaperStarCount(id);

      return res.status(200).json({
        is_starred: isStarred,
        star_count: starCount,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PATCH /api/papers/:id ──────────────────────────────────────────────────
// Updates paper metadata (title, abstract, authors).
// Starred users receive notifications when meaningful metadata fields change.
router.patch(
  "/:id",
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const existingRes = await pool.query(
        "SELECT id, title, abstract, authors, uploader_id FROM papers WHERE id = $1",
        [id]
      );
      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: "Paper not found." });
      }

      const existing = existingRes.rows[0];

      if (
        req.user.role !== ROLES.SYSTEM_ADMIN &&
        existing.uploader_id !== req.user.id
      ) {
        return res.status(403).json({
          error: "You can only edit papers you uploaded.",
        });
      }

      const { title, abstract, authors } = req.body;
      const changedFields = [];
      const updates = [];
      const values = [];

      if (title !== undefined) {
        const trimmedTitle = typeof title === "string" ? title.trim() : "";
        if (!trimmedTitle) {
          return res.status(400).json({ error: "Paper title cannot be blank." });
        }
        if (trimmedTitle !== existing.title) {
          changedFields.push("title");
          values.push(trimmedTitle);
          updates.push(`title = $${values.length}`);
        }
      }

      if (abstract !== undefined) {
        const trimmedAbstract =
          typeof abstract === "string" ? abstract.trim() : null;
        if (trimmedAbstract !== (existing.abstract || null)) {
          changedFields.push("abstract");
          values.push(trimmedAbstract);
          updates.push(`abstract = $${values.length}`);
        }
      }

      if (authors !== undefined) {
        let parsedAuthors;
        try {
          parsedAuthors =
            typeof authors === "string" ? JSON.parse(authors) : authors;
        } catch {
          parsedAuthors = typeof authors === "string" ? [authors] : [];
        }

        if (!Array.isArray(parsedAuthors) || parsedAuthors.length === 0) {
          return res
            .status(400)
            .json({ error: "At least one author is required." });
        }

        const oldAuthorsStr = JSON.stringify(existing.authors || []);
        const newAuthorsStr = JSON.stringify(parsedAuthors);
        if (oldAuthorsStr !== newAuthorsStr) {
          changedFields.push("authors");
          values.push(parsedAuthors);
          updates.push(`authors = $${values.length}`);
        }
      }

      // If nothing changed, return early without notification
      if (updates.length === 0) {
        return res.status(200).json({
          message: "No metadata changes detected.",
          updated: false,
          paper: existing,
        });
      }

      values.push(id);
      const updateQuery = `
        UPDATE papers
        SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING id, title, abstract, authors, arxiv_id, file_size_bytes, mime_type, uploader_id, uploaded_at, updated_at
      `;

      const result = await pool.query(updateQuery, values);
      const updatedPaper = result.rows[0];

      // Dispatch metadata change notification to starrers (excluding actor)
      try {
        await notifyStarrersMetadataChange({
          paperId: id,
          actorUser: req.user,
          changedFields,
          oldPaper: existing,
          newPaper: updatedPaper,
        });
      } catch (notifyErr) {
        console.error(
          "Failed to dispatch metadata change notification:",
          notifyErr.message
        );
      }

      return res.status(200).json({
        message: "Paper metadata updated successfully.",
        updated: true,
        changed_fields: changedFields,
        paper: updatedPaper,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PUT /api/papers/:id ────────────────────────────────────────────────────
// Supports PUT for full or partial metadata updates
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(...UPLOAD_ROLES),
  (req, res, next) => {
    return router.handle({ ...req, method: "PATCH" }, res, next);
  }
);

// ─── GET /api/papers/:id/comments ───────────────────────────────────────────
// Retrieve threaded discussion comments for a paper (supports contextual anchoring).
router.get(
  "/:id/comments",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const result = await pool.query(
        `SELECT c.id, c.paper_id, c.user_id, c.content, c.parent_id, c.annotation_id,
                c.created_at, c.updated_at,
                u.full_name AS user_name, u.email AS user_email,
                COALESCE(u.username, LOWER(SPLIT_PART(u.email, '@', 1))) AS username
         FROM paper_comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.paper_id = $1
         ORDER BY c.created_at ASC`,
        [id]
      );

      return res.status(200).json({ comments: result.rows || [] });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /api/papers/:id/comments ──────────────────────────────────────────
// Post a new comment or reply on a paper with @username mention & contextual anchor support.
router.post(
  "/:id/comments",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const { content, parent_id = null, annotation_id = null } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res
          .status(400)
          .json({ error: "Comment content cannot be blank." });
      }

      if (parent_id && !isValidUUID(parent_id)) {
        return res.status(400).json({ error: "Parent comment ID must be a valid UUID." });
      }

      if (annotation_id && !isValidUUID(annotation_id)) {
        return res.status(400).json({ error: "Annotation ID must be a valid UUID." });
      }

      const paperCheck = await pool.query(
        "SELECT id FROM papers WHERE id = $1",
        [id]
      );
      if (paperCheck.rows.length === 0) {
        return res.status(404).json({ error: "Paper not found." });
      }

      let anchoredAnnotation = null;
      if (annotation_id) {
        const annotRes = await pool.query(
          "SELECT id, paper_id, page_number, position_x, position_y, region_width, region_height FROM annotations WHERE id = $1",
          [annotation_id]
        );
        if (annotRes.rows.length === 0) {
          return res.status(404).json({ error: "Anchored annotation not found." });
        }
        if (annotRes.rows[0].paper_id !== id) {
          return res.status(400).json({
            error: "Annotation does not belong to the specified paper.",
          });
        }
        anchoredAnnotation = annotRes.rows[0];
      }

      const result = await pool.query(
        `INSERT INTO paper_comments (paper_id, user_id, content, parent_id, annotation_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, req.user.id, content.trim(), parent_id, annotation_id]
      );

      const createdComment = result.rows[0];

      // Dispatch mention notifications for any @username in comment
      try {
        await notifyMentions({
          text: content.trim(),
          oldText: null,
          actorUser: req.user,
          paperId: id,
          sourceType: "comment",
          sourceId: createdComment.id,
          pageNumber: anchoredAnnotation?.page_number || null,
          anchor: anchoredAnnotation
            ? {
                annotation_id: anchoredAnnotation.id,
                page_number: anchoredAnnotation.page_number,
                coordinates: {
                  position_x: anchoredAnnotation.position_x,
                  position_y: anchoredAnnotation.position_y,
                  region_width: anchoredAnnotation.region_width,
                  region_height: anchoredAnnotation.region_height,
                },
              }
            : null,
        });
      } catch (notifyErr) {
        console.error(
          "Mention notification error on comment:",
          notifyErr.message
        );
      }

      return res.status(201).json({
        message: "Comment posted successfully.",
        comment: createdComment,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PATCH /api/papers/:id/comments/:commentId ──────────────────────────────
// Edit comment content, re-evaluating @mentions without notifying unchanged recipients.
router.patch(
  "/:id/comments/:commentId",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id, commentId } = req.params;
      if (!isValidUUID(id) || !isValidUUID(commentId)) {
        return res.status(400).json({ error: "Invalid paper ID or comment ID." });
      }

      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Comment content cannot be blank." });
      }

      const existingRes = await pool.query(
        `SELECT c.id, c.paper_id, c.user_id, c.content, c.annotation_id,
                a.page_number
         FROM paper_comments c
         LEFT JOIN annotations a ON a.id = c.annotation_id
         WHERE c.id = $1 AND c.paper_id = $2`,
        [commentId, id]
      );

      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: "Comment not found." });
      }

      const existingComment = existingRes.rows[0];

      if (
        req.user.role !== ROLES.SYSTEM_ADMIN &&
        existingComment.user_id !== req.user.id
      ) {
        return res.status(403).json({ error: "You can only edit your own comments." });
      }

      const updateRes = await pool.query(
        `UPDATE paper_comments
         SET content = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [content.trim(), commentId]
      );

      const updatedComment = updateRes.rows[0];

      // Dispatch mention notification only for newly added mentions
      try {
        await notifyMentions({
          text: content.trim(),
          oldText: existingComment.content,
          actorUser: req.user,
          paperId: id,
          sourceType: "comment",
          sourceId: commentId,
          pageNumber: existingComment.page_number || null,
        });
      } catch (notifyErr) {
        console.error("Mention diff notification error on comment edit:", notifyErr.message);
      }

      return res.status(200).json({
        message: "Comment updated successfully.",
        comment: updatedComment,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── DELETE /api/papers/:id/comments/:commentId ─────────────────────────────
// Remove a comment. Admin or comment author only.
router.delete(
  "/:id/comments/:commentId",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id, commentId } = req.params;
      if (!isValidUUID(id) || !isValidUUID(commentId)) {
        return res.status(400).json({ error: "Invalid paper ID or comment ID." });
      }

      const existingRes = await pool.query(
        "SELECT id, user_id FROM paper_comments WHERE id = $1 AND paper_id = $2",
        [commentId, id]
      );

      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: "Comment not found." });
      }

      if (
        req.user.role !== ROLES.SYSTEM_ADMIN &&
        existingRes.rows[0].user_id !== req.user.id
      ) {
        return res.status(403).json({ error: "You can only delete your own comments." });
      }

      await pool.query("DELETE FROM paper_comments WHERE id = $1", [commentId]);

      return res.status(200).json({ message: "Comment deleted successfully." });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
