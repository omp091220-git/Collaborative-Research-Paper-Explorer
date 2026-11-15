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
import { isValidPdf } from "../utils/pdfValidator.js";
import pool from "../config/database.js";
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
import { getCitationGraph } from "../controllers/citation.controller.js";
import { exportSummaryPdf } from "../controllers/summaryExport.controller.js";
import { downloadArxivPdf } from "../services/paper.service.js";
import { buildSummaryPdfBuffer } from "../utils/summaryPdfBuilder.js";

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
  async (req, res, next) => {
    try {
      const {
        search,
        q,
        author,
        year,
        topic,
        source,
        sort = "newest",
        page = "1",
        limit = "20",
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];
      const values = [req.user.id]; // $1 is user id for starring
      let valIdx = 2;

      // Search term across title, abstract, authors, arxiv_id, publication_year
      const searchTerm = (search || q || "").trim();
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        conditions.push(
          `(p.title ILIKE $${valIdx} OR p.abstract ILIKE $${valIdx} OR p.arxiv_id ILIKE $${valIdx} OR p.authors::text ILIKE $${valIdx} OR p.publication_year::text ILIKE $${valIdx})`
        );
        values.push(searchPattern);
        valIdx++;
      }

      // Author filter
      if (author && author.trim()) {
        conditions.push(`p.authors::text ILIKE $${valIdx}`);
        values.push(`%${author.trim()}%`);
        valIdx++;
      }

      // Year filter
      if (year && !isNaN(parseInt(year, 10))) {
        conditions.push(`p.publication_year = $${valIdx}`);
        values.push(parseInt(year, 10));
        valIdx++;
      }

      // Source filter
      if (source === "arxiv") {
        conditions.push(`p.arxiv_id IS NOT NULL`);
      } else if (source === "upload") {
        conditions.push(`p.arxiv_id IS NULL`);
      }

      // Topic filter (by tag id, slug, or name, including descendant child tags)
      if (topic && topic.trim() && topic !== "all") {
        const topicVal = topic.trim();
        conditions.push(`p.id IN (
          SELECT pta.paper_id
          FROM paper_tag_assignments pta
          JOIN topic_tags tt ON tt.id = pta.tag_id
          WHERE tt.id::text = $${valIdx}
             OR tt.slug = $${valIdx}
             OR tt.name ILIKE $${valIdx}
             OR tt.parent_id IN (
               SELECT id FROM topic_tags WHERE id::text = $${valIdx} OR slug = $${valIdx}
             )
        )`);
        values.push(topicVal);
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Sort ordering
      let orderBy = "p.uploaded_at DESC";
      if (sort === "oldest") orderBy = "p.uploaded_at ASC";
      else if (sort === "title_asc") orderBy = "p.title ASC";
      else if (sort === "title_desc") orderBy = "p.title DESC";
      else if (sort === "size_desc") orderBy = "p.file_size_bytes DESC";
      else if (sort === "year_desc") orderBy = "p.publication_year DESC NULLS LAST, p.uploaded_at DESC";

      // 1. Total count query
      const countQuery = `SELECT COUNT(*)::int AS total FROM papers p ${whereClause}`;
      // Count query parameters do not need $1 (req.user.id) since $1 was only for left join
      const countValues = values.slice(1);
      // Re-index placeholders for count query safely in one pass without cascading
      const countSql = countQuery.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num, 10) - 1}`);
      const countRes = await pool.query(countSql, countValues);
      const total = countRes.rows[0]?.total || 0;

      // 2. Papers list query
      const dataQuery = `
        SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id,
               p.publication_year, p.doi, p.file_size_bytes, p.mime_type,
               p.uploader_id, p.uploaded_at, p.updated_at,
               COALESCE(s.star_count, 0)::int AS star_count,
               COALESCE(us.is_starred, false) AS is_starred,
               COALESCE(pt.tags, '[]'::json) AS tags
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
        LEFT JOIN (
          SELECT pta.paper_id,
                 json_agg(
                   json_build_object(
                     'id', tt.id,
                     'name', tt.name,
                     'slug', tt.slug,
                     'parent_id', tt.parent_id
                   )
                 ) AS tags
          FROM paper_tag_assignments pta
          JOIN topic_tags tt ON tt.id = pta.tag_id
          WHERE pta.annotation_id IS NULL
          GROUP BY pta.paper_id
        ) pt ON pt.paper_id = p.id
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${valIdx} OFFSET $${valIdx + 1}
      `;

      values.push(limitNum, offset);

      const result = await pool.query(dataQuery, values);
      const papers = result.rows.map((p) => ({
        ...p,
        tags: p.tags || [],
        pdf_url: `/api/papers/${p.id}/pdf`,
      }));

      return res.status(200).json({
        papers,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /api/papers/search ───────────────────────────────────────────────────
// Unified Cross-Paper, Topic & Paragraph Search
router.get(
  "/search",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const q = (req.query.q || req.query.search || "").trim();
      const type = (req.query.type || "all").toLowerCase(); // 'all' | 'papers' | 'topics' | 'paragraphs'
      const topic = (req.query.topic || "").trim();
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || (type === "paragraphs" ? 30 : 15)));
      const offset = (page - 1) * limit;

      // When q is empty and type is NOT paragraphs, return empty results
      if (!q && type !== "paragraphs" && type !== "paragraph") {
        return res.status(200).json({
          query: "",
          papers: [],
          topics: [],
          paragraphs: [],
          total: 0,
          page,
          limit,
        });
      }

      const searchPattern = `%${q}%`;
      const isYear = /^\d{4}$/.test(q);

      let papersResults = [];
      let topicsResults = [];
      let paragraphsResults = [];
      let totalParagraphs = 0;

      // 1. Paper Search (Search by title, abstract, authors, arxiv_id, year, or assigned topic tags)
      if (q && (type === "all" || type === "papers" || type === "paper")) {
        const paperSql = `
          SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id,
                 p.publication_year, p.doi, p.file_size_bytes, p.uploaded_at,
                 COALESCE(s.star_count, 0)::int AS star_count,
                 COALESCE(pt.tags, '[]'::json) AS tags
          FROM papers p
          LEFT JOIN (
            SELECT paper_id, COUNT(*)::int AS star_count
            FROM paper_stars GROUP BY paper_id
          ) s ON s.paper_id = p.id
          LEFT JOIN (
            SELECT pta.paper_id,
                   json_agg(json_build_object('id', tt.id, 'name', tt.name, 'slug', tt.slug)) AS tags
            FROM paper_tag_assignments pta
            JOIN topic_tags tt ON tt.id = pta.tag_id
            WHERE pta.annotation_id IS NULL
            GROUP BY pta.paper_id
          ) pt ON pt.paper_id = p.id
          WHERE p.title ILIKE $1
             OR p.abstract ILIKE $1
             OR p.arxiv_id ILIKE $1
             OR p.authors::text ILIKE $1
             OR p.publication_year::text ILIKE $1
             OR EXISTS (
               SELECT 1 FROM paper_tag_assignments pta2
               JOIN topic_tags tt2 ON tt2.id = pta2.tag_id
               WHERE pta2.paper_id = p.id AND (tt2.name ILIKE $1 OR tt2.slug ILIKE $1)
             )
          ORDER BY p.uploaded_at DESC
          LIMIT $2
        `;
        const paperVals = [searchPattern, limit];

        const pRes = await pool.query(paperSql, paperVals);
        papersResults = pRes.rows.map((p) => ({
          ...p,
          tags: p.tags || [],
          pdf_url: `/api/papers/${p.id}/pdf`,
        }));
      }

      // 2. Topic Search (root, child topic tags and full hierarchy paths)
      if (q && (type === "all" || type === "topics" || type === "topic")) {
        const topicSql = `
          SELECT tt.id, tt.name, tt.slug, tt.parent_id, tt.description,
                 parent.name AS parent_name, parent.slug AS parent_slug,
                 COALESCE(cnt.paper_count, 0)::int AS paper_count
          FROM topic_tags tt
          LEFT JOIN topic_tags parent ON parent.id = tt.parent_id
          LEFT JOIN (
            SELECT tag_id, COUNT(DISTINCT paper_id)::int AS paper_count
            FROM paper_tag_assignments
            GROUP BY tag_id
          ) cnt ON cnt.tag_id = tt.id
          WHERE tt.name ILIKE $1
             OR tt.slug ILIKE $1
             OR COALESCE(tt.description, '') ILIKE $1
             OR COALESCE(parent.name, '') ILIKE $1
             OR (COALESCE(parent.name, '') || ' > ' || tt.name) ILIKE $1
          ORDER BY paper_count DESC, tt.name ASC
          LIMIT $2
        `;
        const tRes = await pool.query(topicSql, [searchPattern, limit]);
        topicsResults = tRes.rows.map((t) => ({
          ...t,
          canonicalPath: t.parent_name ? `${t.parent_name} > ${t.name}` : t.name,
        }));
      }

      // 3. Paragraph Search (matching saved annotations, text snippets, page numbers, paper metadata, and assigned topic tags)
      if (type === "all" || type === "paragraphs" || type === "paragraph") {
        const paraConditions = [];
        const paraVals = [];
        let pIdx = 1;

        if (q) {
          paraConditions.push(`(
            a.content ILIKE $${pIdx}
            OR p.title ILIKE $${pIdx}
            OR p.authors::text ILIKE $${pIdx}
            OR EXISTS (
              SELECT 1 FROM paper_tag_assignments pta_sub
              JOIN topic_tags tt_sub ON tt_sub.id = pta_sub.tag_id
              WHERE pta_sub.annotation_id = a.id
                AND (tt_sub.name ILIKE $${pIdx} OR tt_sub.slug ILIKE $${pIdx})
            )
          )`);
          paraVals.push(searchPattern);
          pIdx++;
        }

        if (topic && topic !== "all") {
          paraConditions.push(`EXISTS (
            SELECT 1 FROM paper_tag_assignments pta_t
            JOIN topic_tags tt_t ON tt_t.id = pta_t.tag_id
            WHERE pta_t.annotation_id = a.id
              AND (tt_t.id::text = $${pIdx} OR tt_t.slug = $${pIdx} OR tt_t.name ILIKE $${pIdx})
          )`);
          paraVals.push(topic);
          pIdx++;
        }

        const paraWhere = paraConditions.length > 0 ? `WHERE ${paraConditions.join(" AND ")}` : "";

        // Total count for pagination in Paragraph Explorer
        const paraCountSql = `
          SELECT COUNT(DISTINCT a.id)::int AS total
          FROM annotations a
          JOIN papers p ON p.id = a.paper_id
          ${paraWhere}
        `;
        const countRes = await pool.query(paraCountSql, paraVals);
        totalParagraphs = countRes.rows[0]?.total || 0;

        const paragraphSql = `
          SELECT a.id AS annotation_id, a.paper_id, a.page_number, a.content,
                 a.position_x, a.position_y, a.region_width, a.region_height,
                 a.created_at,
                 p.title AS paper_title, p.authors AS paper_authors, p.publication_year, p.arxiv_id,
                 COALESCE(
                   json_agg(
                     json_build_object('id', tt.id, 'name', tt.name, 'slug', tt.slug)
                   ) FILTER (WHERE tt.id IS NOT NULL),
                   '[]'::json
                 ) AS tags
          FROM annotations a
          JOIN papers p ON p.id = a.paper_id
          LEFT JOIN paper_tag_assignments pta ON pta.annotation_id = a.id
          LEFT JOIN topic_tags tt ON tt.id = pta.tag_id
          ${paraWhere}
          GROUP BY a.id, p.id, p.title, p.authors, p.publication_year, p.arxiv_id
          ORDER BY a.created_at DESC
          LIMIT $${pIdx} OFFSET $${pIdx + 1}
        `;
        paraVals.push(limit, offset);

        const paraRes = await pool.query(paragraphSql, paraVals);
        paragraphsResults = paraRes.rows.map((row) => ({
          annotationId: row.annotation_id,
          paperId: row.paper_id,
          paperTitle: row.paper_title,
          paperAuthors: row.paper_authors,
          publicationYear: row.publication_year,
          arxivId: row.arxiv_id,
          pageNumber: row.page_number,
          content: row.content,
          position: {
            x: row.position_x ? parseFloat(row.position_x) : null,
            y: row.position_y ? parseFloat(row.position_y) : null,
            w: row.region_width ? parseFloat(row.region_width) : null,
            h: row.region_height ? parseFloat(row.region_height) : null,
          },
          tags: row.tags || [],
          createdAt: row.created_at,
        }));
      }

      return res.status(200).json({
        query: q,
        papers: papersResults,
        topics: topicsResults,
        paragraphs: paragraphsResults,
        total: papersResults.length + topicsResults.length + (totalParagraphs || paragraphsResults.length),
        totalParagraphs,
        page,
        limit,
        totalPages: Math.ceil((totalParagraphs || 1) / limit),
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /api/papers/:id ──────────────────────────────────────────────────────
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

      return res.status(200).json({ paper: { ...paper, pdf_url: `/api/papers/${paper.id}/pdf` } });
    } catch (error) {
      return next(error);
    }
  }
);


// ─── GET /api/papers/:id/pdf ──────────────────────────────────────────────────
// Streams the PDF binary file; falls back to automated arXiv caching or synthesis
router.get(
  "/:id/pdf",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Paper ID must be a valid UUID." });
      }

      const result = await pool.query(
        "SELECT id, title, abstract, authors, publication_year, arxiv_id, file_path, mime_type FROM papers WHERE id = $1",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Paper not found." });
      }

      const paper = result.rows[0];

      // Determine the target disk path for this paper's PDF
      let absolutePath;
      if (paper.file_path) {
        if (path.isAbsolute(paper.file_path)) {
          absolutePath = paper.file_path;
        } else {
          const projectRoot = path.resolve(__dirname, "../../..");
          absolutePath = path.resolve(projectRoot, paper.file_path);
        }
      } else {
        const projectRoot = path.resolve(__dirname, "../../..");
        const filename = paper.arxiv_id
          ? `arxiv-${paper.arxiv_id}.pdf`
          : `paper-${paper.id}.pdf`;
        absolutePath = path.resolve(projectRoot, "uploads", filename);
      }

      // Ensure upload directory exists
      const targetDir = path.dirname(absolutePath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 1. If physical file exists on disk, stream it immediately
      if (!fs.existsSync(absolutePath)) {
        // 2. If paper is linked to arXiv, download and cache it locally
        if (paper.arxiv_id) {
          try {
            await downloadArxivPdf(paper.arxiv_id, absolutePath);
          } catch (dlErr) {
            console.warn(`[PDF Stream] Could not download arXiv PDF for ${paper.arxiv_id}:`, dlErr.message);
          }
        }

        // 3. If file still doesn't exist on disk, synthesize an academic PDF document record
        if (!fs.existsSync(absolutePath)) {
          try {
            const authorList = Array.isArray(paper.authors)
              ? paper.authors
              : typeof paper.authors === "string"
              ? paper.authors.split(",").map((a) => a.trim())
              : ["Research Author"];

            const pdfBuf = buildSummaryPdfBuffer({
              paperTitle: paper.title || "Research Paper Document",
              authors: authorList,
              publicationYear: paper.publication_year || null,
              abstract: paper.abstract || "Original research paper document archive.",
              summaryText:
                paper.abstract ||
                "Research manuscript content registered in Collaborative Research Paper Explorer.",
              keyFindings: [
                "Peer-reviewed academic research preprint representation.",
                "Positional annotation & hierarchical topic tagging ready.",
              ],
            });
            fs.writeFileSync(absolutePath, pdfBuf);
          } catch (genErr) {
            console.error("[PDF Stream] PDF synthesis fallback failed:", genErr.message);
          }
        }
      }

      if (fs.existsSync(absolutePath)) {
        const safeTitle = (paper.title || "paper")
          .replace(/[/\\?%*:|"<>]/g, "_")
          .trim();
        res.setHeader("Content-Type", paper.mime_type || "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(safeTitle)}.pdf"`
        );
        return res.sendFile(absolutePath, (err) => {
          if (err && !res.headersSent) {
            return next(err);
          }
        });
      }

      return res.status(404).json({
        error: "PDF file is not available for this research paper.",
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /api/papers/:id/citation-graph ─────────────────────────────────────
// FR-16: Retrieve interactive citation graph (backward references, forward citations, co-citation clusters)
router.get(
  "/:id/citation-graph",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  getCitationGraph
);

// FR-35 & FR-36: Export summary PDF with failure handling
router.get(
  "/:id/export/summary-pdf",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  exportSummaryPdf
);

// ─── POST /api/papers/upload ─────────────────────────────────────────────────
// RESEARCHER and SYSTEM_ADMIN can upload PDF papers.
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
