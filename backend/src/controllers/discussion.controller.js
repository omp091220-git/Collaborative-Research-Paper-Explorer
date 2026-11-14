import pool from "../config/database.js";
import { isValidUUID } from "../middleware/paperAccess.js";
import {
  extractMentions,
  resolveMentionedUsers,
  notifyMentionedUsers,
} from "../services/mention.service.js";
import { createNotification } from "../services/notification.service.js";

const VALID_ANCHOR_TYPES = ["text_highlight", "figure", "annotation", "general"];
const VALID_STATUSES = ["OPEN", "RESOLVED", "CLOSED"];

/**
 * GET /api/papers/:paperId/discussions
 */
export async function getPaperDiscussions(req, res, next) {
  try {
    const paper = req.paper;
    const { status, anchor_type, page_number } = req.query;

    const conditions = ["t.paper_id = $1"];
    const params = [paper.id];
    let paramIndex = 2;

    if (status && VALID_STATUSES.includes(status.toUpperCase())) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (anchor_type && VALID_ANCHOR_TYPES.includes(anchor_type.toLowerCase())) {
      conditions.push(`t.anchor_type = $${paramIndex++}`);
      params.push(anchor_type.toLowerCase());
    }

    if (page_number && !isNaN(Number(page_number))) {
      conditions.push(
        `(t.anchor_data->>'page_number' = $${paramIndex} OR a.page_number = $${paramIndex})`
      );
      params.push(Number(page_number));
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    const query = `
      SELECT t.id, t.paper_id, t.created_by, t.title, t.anchor_type, t.anchor_data,
             t.annotation_id, t.status, t.created_at, t.updated_at,
             u.full_name as creator_name, u.email as creator_email,
             COUNT(m.id)::int as message_count,
             MAX(m.created_at) as last_message_at,
             a.page_number as annotation_page, a.content as annotation_content
      FROM discussion_threads t
      JOIN users u ON t.created_by = u.id
      LEFT JOIN annotations a ON t.annotation_id = a.id
      LEFT JOIN discussion_messages m ON t.id = m.thread_id
      WHERE ${whereClause}
      GROUP BY t.id, u.full_name, u.email, a.page_number, a.content
      ORDER BY t.updated_at DESC
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      paper_id: paper.id,
      threads: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/papers/:paperId/discussions
 */
export async function createDiscussionThread(req, res, next) {
  try {
    const paper = req.paper;
    const {
      title,
      anchor_type: rawAnchorType,
      anchor_data,
      annotation_id,
      content,
    } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        error: "Discussion message content is required and cannot be empty.",
      });
    }

    const anchorType =
      typeof rawAnchorType === "string" &&
      VALID_ANCHOR_TYPES.includes(rawAnchorType.toLowerCase())
        ? rawAnchorType.toLowerCase()
        : "text_highlight";

    let sanitizedAnchorData = {};
    if (anchor_data && typeof anchor_data === "object") {
      sanitizedAnchorData = anchor_data;
    }

    if (annotation_id && !isValidUUID(annotation_id)) {
      return res.status(400).json({
        error: "annotation_id must be a valid UUID.",
      });
    }

    // Default title if empty
    let finalTitle = typeof title === "string" ? title.trim() : "";
    if (!finalTitle) {
      if (sanitizedAnchorData.selected_text) {
        finalTitle =
          sanitizedAnchorData.selected_text.length > 50
            ? `${sanitizedAnchorData.selected_text.slice(0, 47)}...`
            : sanitizedAnchorData.selected_text;
      } else if (sanitizedAnchorData.figure_caption) {
        finalTitle = sanitizedAnchorData.figure_caption;
      } else {
        finalTitle =
          content.trim().length > 50
            ? `${content.trim().slice(0, 47)}...`
            : content.trim();
      }
    }

    // Parse and resolve mentions
    const mentionedTokens = extractMentions(content);
    const matchedUsers = await resolveMentionedUsers(mentionedTokens, req.user.id);
    const validMentions = matchedUsers.map((u) => u.email.toLowerCase());

    // Insert discussion thread
    const threadRes = await pool.query(
      `INSERT INTO discussion_threads (
         paper_id, created_by, title, anchor_type, anchor_data, annotation_id, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
       RETURNING *`,
      [
        paper.id,
        req.user.id,
        finalTitle,
        anchorType,
        JSON.stringify(sanitizedAnchorData),
        annotation_id || null,
      ]
    );

    const thread = threadRes.rows[0];

    // Insert initial message
    const msgRes = await pool.query(
      `INSERT INTO discussion_messages (thread_id, parent_id, user_id, content, mentions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [thread.id, null, req.user.id, content.trim(), validMentions]
    );

    const initialMessage = {
      ...msgRes.rows[0],
      user_name: req.user.full_name,
      user_email: req.user.email,
    };

    // Send notifications to mentioned users
    if (matchedUsers.length > 0) {
      await notifyMentionedUsers({
        paper,
        threadId: thread.id,
        author: req.user,
        content: content.trim(),
        matchedUsers,
      });
    }

    return res.status(201).json({
      message: "Discussion thread created successfully.",
      thread: {
        ...thread,
        creator_name: req.user.full_name,
        creator_email: req.user.email,
      },
      initial_message: initialMessage,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/papers/:paperId/discussions/:threadId
 */
export async function getDiscussionThread(req, res, next) {
  try {
    const { paperId, threadId } = req.params;

    if (!isValidUUID(threadId)) {
      return res.status(400).json({ error: "Invalid thread ID format." });
    }

    const threadRes = await pool.query(
      `SELECT t.*, u.full_name as creator_name, u.email as creator_email,
              a.page_number as annotation_page, a.content as annotation_content,
              a.position_x, a.position_y, a.region_width, a.region_height
       FROM discussion_threads t
       JOIN users u ON t.created_by = u.id
       LEFT JOIN annotations a ON t.annotation_id = a.id
       WHERE t.id = $1 AND t.paper_id = $2`,
      [threadId, paperId]
    );

    if (threadRes.rows.length === 0) {
      return res.status(404).json({ error: "Discussion thread not found." });
    }

    const messagesRes = await pool.query(
      `SELECT m.id, m.thread_id, m.parent_id, m.user_id, m.content, m.mentions,
              m.created_at, m.updated_at,
              u.full_name as user_name, u.email as user_email
       FROM discussion_messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC`,
      [threadId]
    );

    return res.status(200).json({
      thread: threadRes.rows[0],
      messages: messagesRes.rows,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/papers/:paperId/discussions/:threadId/messages
 */
export async function postDiscussionReply(req, res, next) {
  try {
    const { paperId, threadId } = req.params;
    const { content, parent_id } = req.body;

    if (!isValidUUID(threadId)) {
      return res.status(400).json({ error: "Invalid thread ID format." });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        error: "Reply message content is required and cannot be empty.",
      });
    }

    // Verify thread exists
    const threadRes = await pool.query(
      `SELECT * FROM discussion_threads WHERE id = $1 AND paper_id = $2`,
      [threadId, paperId]
    );

    if (threadRes.rows.length === 0) {
      return res.status(404).json({ error: "Discussion thread not found." });
    }

    const thread = threadRes.rows[0];

    // If replying to a specific parent message, verify it exists in this thread
    let parentAuthorId = null;
    if (parent_id) {
      if (!isValidUUID(parent_id)) {
        return res.status(400).json({ error: "Invalid parent_id format." });
      }

      const parentRes = await pool.query(
        `SELECT id, user_id FROM discussion_messages WHERE id = $1 AND thread_id = $2`,
        [parent_id, threadId]
      );

      if (parentRes.rows.length === 0) {
        return res.status(404).json({
          error: "Parent message not found in this discussion thread.",
        });
      }
      parentAuthorId = parentRes.rows[0].user_id;
    }

    // Parse and resolve mentions
    const mentionedTokens = extractMentions(content);
    const matchedUsers = await resolveMentionedUsers(mentionedTokens, req.user.id);
    const validMentions = matchedUsers.map((u) => u.email.toLowerCase());

    // Insert reply message
    const msgRes = await pool.query(
      `INSERT INTO discussion_messages (thread_id, parent_id, user_id, content, mentions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [threadId, parent_id || null, req.user.id, content.trim(), validMentions]
    );

    // Update thread updated_at
    await pool.query(
      `UPDATE discussion_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [threadId]
    );

    const message = {
      ...msgRes.rows[0],
      user_name: req.user.full_name,
      user_email: req.user.email,
    };

    // Notify mentioned users
    if (matchedUsers.length > 0) {
      await notifyMentionedUsers({
        paper: req.paper,
        threadId,
        author: req.user,
        content: content.trim(),
        matchedUsers,
      });
    }

    // Notify thread creator (if not the replier and not already notified as mentioned)
    const mentionedIds = new Set(matchedUsers.map((u) => u.id));
    const authorName = req.user.full_name || req.user.email || "A collaborator";

    if (thread.created_by !== req.user.id && !mentionedIds.has(thread.created_by)) {
      await createNotification({
        userId: thread.created_by,
        type: "DISCUSSION_REPLY",
        title: "New reply on your thread",
        message: `${authorName} replied to your thread "${thread.title}" on paper "${req.paper.title}".`,
        link: `/papers/${paperId}`,
        data: { paper_id: paperId, thread_id: threadId },
      });
    }

    // Notify parent message author if different
    if (
      parentAuthorId &&
      parentAuthorId !== req.user.id &&
      parentAuthorId !== thread.created_by &&
      !mentionedIds.has(parentAuthorId)
    ) {
      await createNotification({
        userId: parentAuthorId,
        type: "DISCUSSION_REPLY",
        title: "Reply to your comment",
        message: `${authorName} replied directly to your message on "${req.paper.title}".`,
        link: `/papers/${paperId}`,
        data: { paper_id: paperId, thread_id: threadId },
      });
    }

    return res.status(201).json({
      message: "Reply posted successfully.",
      discussion_message: message,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/papers/:paperId/discussions/:threadId
 */
export async function updateDiscussionThread(req, res, next) {
  try {
    const { paperId, threadId } = req.params;
    const { status, title } = req.body;

    if (!isValidUUID(threadId)) {
      return res.status(400).json({ error: "Invalid thread ID format." });
    }

    const threadRes = await pool.query(
      `SELECT * FROM discussion_threads WHERE id = $1 AND paper_id = $2`,
      [threadId, paperId]
    );

    if (threadRes.rows.length === 0) {
      return res.status(404).json({ error: "Discussion thread not found." });
    }

    const thread = threadRes.rows[0];

    // Check permissions: Thread creator, paper owner/admin, or edit role can update
    const isCreator = req.user.id === thread.created_by;
    const canEdit = req.paperPermissions?.canEdit || req.paperPermissions?.canManage;

    if (!isCreator && !canEdit) {
      return res.status(403).json({
        error: "You do not have permission to modify this discussion thread.",
      });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (status) {
      const normalizedStatus = status.trim().toUpperCase();
      if (!VALID_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}.`,
        });
      }
      updates.push(`status = $${idx++}`);
      values.push(normalizedStatus);
    }

    if (title && typeof title === "string" && title.trim()) {
      updates.push(`title = $${idx++}`);
      values.push(title.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "Provide title or status to update." });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(threadId);

    const updateQuery = `
      UPDATE discussion_threads
      SET ${updates.join(", ")}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    return res.status(200).json({
      message: "Discussion thread updated successfully.",
      thread: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/papers/:paperId/discussions/:threadId/messages/:messageId
 */
export async function deleteDiscussionMessage(req, res, next) {
  try {
    const { paperId, threadId, messageId } = req.params;

    if (!isValidUUID(threadId) || !isValidUUID(messageId)) {
      return res.status(400).json({ error: "Invalid ID format." });
    }

    const msgRes = await pool.query(
      `SELECT m.* FROM discussion_messages m
       JOIN discussion_threads t ON m.thread_id = t.id
       WHERE m.id = $1 AND m.thread_id = $2 AND t.paper_id = $3`,
      [messageId, threadId, paperId]
    );

    if (msgRes.rows.length === 0) {
      return res.status(404).json({ error: "Message not found." });
    }

    const message = msgRes.rows[0];
    const isAuthor = req.user.id === message.user_id;
    const canManage = req.paperPermissions?.canManage;

    if (!isAuthor && !canManage) {
      return res.status(403).json({
        error: "You do not have permission to delete this message.",
      });
    }

    await pool.query(`DELETE FROM discussion_messages WHERE id = $1`, [messageId]);

    return res.status(200).json({
      message: "Discussion message deleted successfully.",
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/papers/:paperId/discussions/:threadId
 */
export async function deleteDiscussionThread(req, res, next) {
  try {
    const { paperId, threadId } = req.params;

    if (!isValidUUID(threadId)) {
      return res.status(400).json({ error: "Invalid thread ID format." });
    }

    const threadRes = await pool.query(
      `SELECT * FROM discussion_threads WHERE id = $1 AND paper_id = $2`,
      [threadId, paperId]
    );

    if (threadRes.rows.length === 0) {
      return res.status(404).json({ error: "Discussion thread not found." });
    }

    const thread = threadRes.rows[0];
    const isCreator = req.user.id === thread.created_by;
    const canManage = req.paperPermissions?.canManage;

    if (!isCreator && !canManage) {
      return res.status(403).json({
        error: "You do not have permission to delete this discussion thread.",
      });
    }

    await pool.query(`DELETE FROM discussion_threads WHERE id = $1`, [threadId]);

    return res.status(200).json({
      message: "Discussion thread deleted successfully.",
    });
  } catch (error) {
    return next(error);
  }
}
