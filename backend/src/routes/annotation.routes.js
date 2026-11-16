
import express from "express";
import pool from "../config/database.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { ROLES } from "../utils/roles.js";
import { notifyMentions } from "../services/notification.service.js";

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

      const query = paper_id
        ? `SELECT id, paper_id, created_by, page_number, content,
                  position_x, position_y, region_width, region_height,
                  created_at, updated_at
           FROM annotations
           WHERE paper_id = $1
           ORDER BY created_at DESC`
        : `SELECT id, paper_id, created_by, page_number, content,
                  position_x, position_y, region_width, region_height,
                  created_at, updated_at
           FROM annotations
           ORDER BY created_at DESC`;

      const result = paper_id
        ? await pool.query(query, [paper_id])
        : await pool.query(query);

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
router.patch(
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
  }
);

// Only system admins can delete annotations.
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLE),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: "Annotation ID must be a valid UUID.",
        });
      }

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
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
