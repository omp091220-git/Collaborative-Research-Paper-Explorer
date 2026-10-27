/**
 * paper.controller.js
 *
 * HTTP request handling for /api/papers.
 * Each export corresponds to exactly one route handler.
 *
 * Responsibilities:
 *   - Read and validate HTTP input (req.body, req.params, req.file).
 *   - Call the service layer for business logic (metadata, arXiv fetching).
 *   - Call the repository layer for DB persistence.
 *   - Write the HTTP response.
 *   - Handle known error codes from PostgreSQL (23505, 23514) and
 *     propagate unknown errors via next().
 *
 * This controller intentionally contains no direct pool queries.
 * All DB access goes through paper.repository.js.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  insertPaper,
  findAllPapers,
  findPaperById,
  findPaperByArxivId,
} from "../repositories/paper.repository.js";

import {
  safeUnlink,
  parseArxivId,
  downloadArxivPdf,
  fetchArxivMetadata,
  validateUploadMetadata,
} from "../services/paper.service.js";

import { isValidPdf } from "../utils/pdfValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the uploads directory root (same resolution as FR-06 used).
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

/**
 * GET /api/papers
 * List all papers, newest first.
 */
export const listPapers = async (req, res, next) => {
  try {
    const papers = await findAllPapers();
    return res.status(200).json({ papers });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/papers/:id
 * Return a single paper by UUID.
 */
export const getPaperById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paper = await findPaperById(id);
    if (!paper) {
      return res.status(404).json({ error: "Paper not found." });
    }
    return res.status(200).json({ paper });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/papers/upload
 * Upload a PDF file with client-supplied metadata.
 *
 * Required body fields: title, authors (JSON array or comma string)
 * Optional body fields: abstract, doi, publication_year  ← FR-07
 *
 * The PDF is already on disk at req.file.path (placed by multer middleware
 * in the routes file, before this handler runs).
 *
 * FR-07 note on PDF metadata extraction:
 *   Automatic extraction of title/authors/abstract from the PDF binary is
 *   out of scope. Client-supplied values are accepted and validated.
 *   doi and publication_year are new optional fields added by FR-07.
 */
export const uploadPaper = async (req, res, next) => {
  const uploadedFilePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF file provided. Include a file field named "pdf".',
      });
    }

    // Validate PDF magic bytes (never trust the client-supplied MIME type).
    const valid = await isValidPdf(uploadedFilePath);
    if (!valid) {
      safeUnlink(uploadedFilePath);
      return res
        .status(415)
        .json({ error: "The uploaded file is not a valid PDF." });
    }

    // Validate and normalise request body metadata.
    const validation = validateUploadMetadata(req.body);
    if (!validation.valid) {
      safeUnlink(uploadedFilePath);
      return res.status(validation.status).json({ error: validation.error });
    }

    const { title, abstract, authors, doi, publicationYear } = validation.data;

    // Store a relative path (portable across deployments).
    const relativeFilePath = path
      .relative(path.resolve(__dirname, "../../.."), uploadedFilePath)
      .replace(/\\/g, "/");

    let paper;
    try {
      paper = await insertPaper({
        title,
        abstract,
        authors,
        doi,
        publicationYear,
        arxivId: null,
        filePath: relativeFilePath,
        fileSizeBytes: req.file.size,
        mimeType: "application/pdf",
        uploaderId: req.user.id,
      });
    } catch (dbError) {
      safeUnlink(uploadedFilePath);
      // Unique constraint violation (file_path or doi)
      if (dbError.code === "23505") {
        return res
          .status(409)
          .json({ error: "This paper already exists in the system." });
      }
      // DB CHECK constraint violation (size, mime, year range, etc.)
      if (dbError.code === "23514") {
        return res.status(400).json({
          error: "File failed database validation. Check size and type.",
        });
      }
      return next(dbError);
    }

    return res.status(201).json({
      message: "Paper uploaded successfully.",
      paper,
    });
  } catch (error) {
    safeUnlink(uploadedFilePath);
    return next(error);
  }
};

/**
 * POST /api/papers/import
 * Import a paper by arXiv ID. Downloads the PDF and fetches metadata.
 *
 * FR-07: fetchArxivMetadata now also returns doi and publicationYear.
 */
export const importPaper = async (req, res, next) => {
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

  let destPath = null;
  try {
    // Duplicate check before downloading anything.
    let existing;
    try {
      existing = await findPaperByArxivId(arxivId);
    } catch (error) {
      return next(error);
    }
    if (existing) {
      return res.status(409).json({
        error: `This paper (arXiv:${arxivId}) is already in the system.`,
        paper: existing,
      });
    }

    // Fetch metadata from the arXiv Atom API.
    // FR-07: result now includes { doi, publicationYear } in addition to
    //        { title, abstract, authors } from FR-06.
    let metadata;
    try {
      metadata = await fetchArxivMetadata(arxivId);
    } catch (err) {
      const status = err.statusCode || 502;
      return res.status(status).json({
        error: err.message || "Failed to fetch paper metadata from arXiv.",
      });
    }

    // Download the PDF.
    const safeName = `arxiv-${arxivId.replace(/[^a-z0-9.\-]/gi, "_")}-${Date.now()}.pdf`;
    destPath = path.join(UPLOADS_DIR, safeName);
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

    // Validate PDF magic bytes.
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

    let paper;
    try {
      paper = await insertPaper({
        title: metadata.title,
        abstract: metadata.abstract,
        authors: metadata.authors,
        doi: metadata.doi,              // FR-07: from <arxiv:doi> in Atom feed
        publicationYear: metadata.publicationYear, // FR-07: from <published>
        arxivId,
        filePath: relativeFilePath,
        fileSizeBytes: fileSize,
        mimeType: "application/pdf",
        uploaderId: req.user.id,
      });
    } catch (dbError) {
      safeUnlink(destPath);
      if (dbError.code === "23505") {
        return res.status(409).json({
          error: `This paper (arXiv:${arxivId}) is already in the system.`,
        });
      }
      if (dbError.code === "23514") {
        return res.status(400).json({
          error: "Paper failed database validation. Check size and metadata.",
        });
      }
      return next(dbError);
    }

    return res.status(201).json({
      message: `Paper "${metadata.title}" imported from arXiv successfully.`,
      paper,
    });
  } catch (error) {
    if (destPath) {
      safeUnlink(destPath);
    }
    return next(error);
  }
};
