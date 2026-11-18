
import express from "express";
import pool from "../config/database.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { ROLES, normalizeRole } from "../utils/roles.js";
import { notifyMentions } from "../services/notification.service.js";
import { checkPaperAccess } from "../services/paperPermission.service.js";

const router = express.Router();

const ALL_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDENT,
];

const EDIT_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
];

const ADMIN_ROLE = [ROLES.SYSTEM_ADMIN];

const isValidUUID = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const validateAnnotation = (body, partial = false) => {
  const {
    page_number,
    content,
    position_x,
    position_y,
    region_width,
    region_height,
  } = body;

  if (!partial || page_number !== undefined) {
    if (!Number.isInteger(page_number) || page_number < 1) {
      return "page_number must be a positive integer.";
    }
  }

  if (!partial || content !== undefined) {
    if (typeof content !== "string" || !content.trim()) {
      return "content must be a non-empty string.";
    }
  }

  const coordinates = {
    position_x,
    position_y,
    region_width,
    region_height,
  };

  for (const [key, value] of Object.entries(coordinates)) {
    if (value === undefined || value === null) continue;

    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      return `${key} must be a number between 0 and 1.`;
    }
  }

  if (region_width !== undefined && region_width !== null && region_width <= 0) {
    return "region_width must be greater than 0.";
  }

  if (region_height !== undefined && region_height !== null && region_height <= 0) {
    return "region_height must be greater than 0.";
  }

  return null;
};

// All authenticated roles can view annotations.
router.get(
  "/",
  authenticateToken,
  authorizeRoles(...ALL_ROLES),
  async (req, res, next) => {
    try {
      const { paper_id } = req.query;

      if (paper_id && !isValidUUID(paper_id)) {
        return res.status(400).json({
          error: "paper_id must be a valid UUID.",
        });
      }

      const isSysAdmin = normalizeRole(req.user.role) === ROLES.SYSTEM_ADMIN;

      if (paper_id) {
        const { allowed, reason } = await checkPaperAccess(paper_id, req.user, 'VIEW');
        if (!allowed) {
          if (reason === 'not_found') return res.status(404).json({ error: "Paper not found." });
          return res.status(403).json({
            error: "You do not have permission to view annotations on this private paper.",
          });
        }
      }

      const query = paper_id
        ? `SELECT a.id, a.paper_id, a.created_by, a.page_number, a.content,
                  a.position_x, a.position_y, a.region_width, a.region_height,
                  a.created_at, a.updated_at,
                  u.full_name AS author_name, u.email AS author_email
           FROM annotations a
           LEFT JOIN users u ON a.created_by = u.id
           WHERE a.paper_id = $1
           ORDER BY a.created_at DESC`
        : `SELECT a.id, a.paper_id, a.created_by, a.page_number, a.content,
                  a.position_x, a.position_y, a.region_width, a.region_height,
                  a.created_at, a.updated_at,
                  u.full_name AS author_name, u.email AS author_email
           FROM annotations a
           JOIN papers p ON p.id = a.paper_id
           LEFT JOIN users u ON a.created_by = u.id
           WHERE p.is_archived = FALSE
             AND (
               p.visibility = 'PUBLIC'
               OR p.uploader_id = $1
               OR $2 = TRUE
               OR EXISTS (
                 SELECT 1 FROM paper_collaborators pc
                 WHERE pc.paper_id = p.id AND pc.user_id = $1 AND pc.status <> 'REVOKED'
               )
             )
           ORDER BY a.created_at DESC`;

      const result = paper_id
        ? await pool.query(query, [paper_id])
        : await pool.query(query, [req.user.id, isSysAdmin]);

      return res.status(200).json({
        annotations: result.rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// System admins and researchers can create annotations.
router.post(
  "/",
  authenticateToken,
  authorizeRoles(...EDIT_ROLES),
  async (req, res, next) => {
    try {
      const { paper_id } = req.body;

      if (!isValidUUID(paper_id)) {
        return res.status(400).json({
          error: "paper_id must be a valid UUID.",
        });
      }

      // Enforce paper-level ANNOTATE permission
      const { allowed, reason } = await checkPaperAccess(paper_id, req.user, 'ANNOTATE');
      if (!allowed) {
        if (reason === 'not_found') {
          return res.status(404).json({ error: "Paper not found." });
        }
        return res.status(403).json({
          error: "You do not have permission to annotate on this paper. Please request access.",
        });
      }

      const validationError = validateAnnotation(req.body);

      if (validationError) {
        return res.status(400).json({
          error: validationError,
        });
      }

      const {
        page_number,
        content,
        position_x,
        position_y,
        region_width,
        region_height,
      } = req.body;

      const result = await pool.query(
        `INSERT INTO annotations (
           paper_id, created_by, page_number, content,
           position_x, position_y, region_width, region_height
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          paper_id,
          req.user.id,
          page_number,
          content.trim(),
          position_x ?? null,
          position_y ?? null,
          region_width ?? null,
          region_height ?? null,
        ]
      );

      const createdAnnotation = result.rows[0];

      // 1. Notify mentioned users in annotation
      try {
        await notifyMentions({
          text: content.trim(),
          oldText: null,
          actorUser: req.user,
          paperId: paper_id,
          sourceType: "annotation",
          sourceId: createdAnnotation.id,
          pageNumber: page_number,
        });
      } catch (notifyErr) {
        console.error("Mention notification error:", notifyErr.message);
      }

      // 2. Notify paper followers/starrers of new note (excluding author & mentioned)
      try {
        const { notifyStarrersPaperNoteAdded } = await import(
          "../services/notification.service.js"
        );
        await notifyStarrersPaperNoteAdded({
          paperId: paper_id,
          actorUser: req.user,
          annotation: createdAnnotation,
        });
      } catch (noteNotifyErr) {
        console.error("Follower note notification error:", noteNotifyErr.message);
      }

      return res.status(201).json({
        message: "Annotation created successfully.",
        annotation: createdAnnotation,
      });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(404).json({
          error: "The specified paper or user does not exist.",
        });
      }

      return next(error);
    }
  }
);

// Admins can edit any annotation; annotators can edit their own.
const updateAnnotationHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: "Annotation ID must be a valid UUID.",
      });
    }

    const expectedPaperId = req.query.paper_id || req.body?.paper_id || null;
    if (expectedPaperId && !isValidUUID(expectedPaperId)) {
      return res.status(400).json({
        error: "paper_id must be a valid UUID.",
      });
    }

    const allowedFields = [
      "page_number",
      "content",
      "position_x",
      "position_y",
      "region_width",
      "region_height",
    ];

    const suppliedFields = allowedFields.filter(
      (field) => req.body[field] !== undefined
    );

    if (suppliedFields.length === 0) {
      return res.status(400).json({
        error: "Provide at least one field to update.",
      });
    }

    const validationError = validateAnnotation(req.body, true);

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    const existing = await pool.query(
      "SELECT id, created_by FROM annotations WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: "Annotation not found.",
      });
    }

    const annotation = existing.rows[0];

    if (expectedPaperId) {
      try {
        const paperCheck = await pool.query(
          "SELECT paper_id FROM annotations WHERE id = $1",
          [id]
        );
        if (paperCheck.rows.length > 0 && paperCheck.rows[0].paper_id !== expectedPaperId) {
          return res.status(400).json({
            error: "Annotation does not belong to the specified paper.",
          });
        }
      } catch {
        // paper check fallback
      }
    }

    // Fetch previous content for mention diffing if content is being updated
    let previousContent = null;
    if (req.body.content !== undefined) {
      try {
        const contentLookup = await pool.query(
          "SELECT content FROM annotations WHERE id = $1",
          [id]
        );
        previousContent = contentLookup.rows[0]?.content || null;
      } catch {
        // Graceful fallback
      }
    }

    if (
      req.user.role !== ROLES.SYSTEM_ADMIN &&
      annotation.created_by !== req.user.id
    ) {
      return res.status(403).json({
        error: "You can only edit your own annotations.",
      });
    }

    const values = [];
    const assignments = suppliedFields.map((field) => {
      values.push(
        field === "content" && typeof req.body[field] === "string"
          ? req.body[field].trim()
          : req.body[field]
      );

      return `${field} = $${values.length}`;
    });

    values.push(id);

    const result = await pool.query(
      `UPDATE annotations
       SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    const updatedAnnotation = result.rows[0];

    if (req.body.content !== undefined && updatedAnnotation) {
      try {
        await notifyMentions({
          text: req.body.content.trim(),
          oldText: previousContent || null,
          actorUser: req.user,
          paperId: updatedAnnotation.paper_id,
          sourceType: "annotation",
          sourceId: updatedAnnotation.id,
          pageNumber: updatedAnnotation.page_number,
        });
      } catch (notifyErr) {
        console.error("Mention notification error on update:", notifyErr.message);
      }
    }

    return res.status(200).json({
      message: "Annotation updated successfully.",
      annotation: updatedAnnotation,
    });
  } catch (error) {
    return next(error);
  }
};

router.patch(
  "/:id",
  authenticateToken,
  authorizeRoles(...EDIT_ROLES),
  updateAnnotationHandler
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(...EDIT_ROLES),
  updateAnnotationHandler
);

// Admins can delete any annotation; annotators can delete their own.
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(...EDIT_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: "Annotation ID must be a valid UUID.",
        });
      }

      const expectedPaperId = req.query.paper_id || req.body?.paper_id || null;
      if (expectedPaperId && !isValidUUID(expectedPaperId)) {
        return res.status(400).json({
          error: "paper_id must be a valid UUID.",
        });
      }

      if (expectedPaperId) {
        try {
          const paperCheck = await pool.query(
            "SELECT paper_id FROM annotations WHERE id = $1",
            [id]
          );
          if (paperCheck.rows.length > 0 && paperCheck.rows[0].paper_id !== expectedPaperId) {
            return res.status(400).json({
              error: "Annotation does not belong to the specified paper.",
            });
          }
        } catch {
          // paper check fallback
        }
      }

      if (req.user.role === ROLES.SYSTEM_ADMIN) {
        const result = await pool.query(
          "DELETE FROM annotations WHERE id = $1 RETURNING id",
          [id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: "Annotation not found.",
          });
        }

        return res.status(200).json({
          message: "Annotation deleted successfully.",
          id: result.rows[0].id,
        });
      }

      // Researchers can delete their own annotations or annotations on papers they own
      const existing = await pool.query(
        "SELECT id, created_by FROM annotations WHERE id = $1",
        [id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: "Annotation not found.",
        });
      }

      const annotation = existing.rows[0];
      const isAuthor = Boolean(annotation.created_by && annotation.created_by === req.user.id);
      
      let isPaperOwner = false;
      if (!isAuthor) {
        try {
          const paperLookup = await pool.query(
            "SELECT a.paper_id, p.uploader_id FROM papers p JOIN annotations a ON a.paper_id = p.id WHERE a.id = $1",
            [id]
          );
          isPaperOwner = Boolean(paperLookup.rows[0]?.uploader_id && paperLookup.rows[0].uploader_id === req.user.id);
        } catch {
          // paper lookup optional
        }
      }

      if (!isAuthor && !isPaperOwner) {
        if (!annotation.created_by) {
          return res.status(403).json({
            error: "Legacy annotations without ownership metadata can only be deleted by the paper owner or a system administrator.",
          });
        }

        return res.status(403).json({
          error: "You can only delete your own annotations.",
        });
      }

      const result = await pool.query(
        "DELETE FROM annotations WHERE id = $1 RETURNING id",
        [id]
      );

      return res.status(200).json({
        message: "Annotation deleted successfully.",
        id: result.rows[0].id,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
