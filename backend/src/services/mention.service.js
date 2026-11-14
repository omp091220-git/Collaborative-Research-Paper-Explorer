import pool from "../config/database.js";
import { createNotification } from "./notification.service.js";

const MENTION_REGEX = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_.-]+)/g;

/**
 * Parses all @mentions from text content.
 * Returns array of distinct mention tokens (lowercased without the leading @).
 */
export function extractMentions(text) {
  if (!text || typeof text !== "string") return [];
  const matches = [];
  let match;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match[1]) {
      matches.push(match[1].toLowerCase());
    }
  }
  return [...new Set(matches)];
}

/**
 * Resolves mention tokens to registered user records.
 * Searches by exact email match, email username prefix, or full_name substring.
 */
export async function resolveMentionedUsers(tokens, excludeUserId = null) {
  if (!tokens || tokens.length === 0) return [];

  // Query users matching any token by email or full_name
  const matchedUsers = new Map();

  for (const token of tokens) {
    const isEmail = token.includes("@");
    let res;
    if (isEmail) {
      res = await pool.query(
        `SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1)`,
        [token]
      );
    } else {
      res = await pool.query(
        `SELECT id, email, full_name
         FROM users
         WHERE LOWER(email) LIKE LOWER($1)
            OR LOWER(full_name) = LOWER($2)
            OR LOWER(full_name) LIKE LOWER($3)
         LIMIT 5`,
        [`${token}@%`, token, `%${token}%`]
      );
    }

    for (const u of res.rows) {
      if (excludeUserId && u.id === excludeUserId) continue;
      matchedUsers.set(u.id, u);
    }
  }

  return Array.from(matchedUsers.values());
}

/**
 * Sends notifications to mentioned users.
 */
export async function notifyMentionedUsers({
  paper,
  threadId,
  author,
  content,
  matchedUsers,
}) {
  if (!matchedUsers || matchedUsers.length === 0) return [];

  const notifications = [];
  const authorName = author?.full_name || author?.email || "A collaborator";
  const paperTitle = paper?.title || "Research Paper";
  const snippet = content.length > 80 ? `${content.slice(0, 77)}...` : content;

  for (const user of matchedUsers) {
    const notif = await createNotification({
      userId: user.id,
      type: "DISCUSSION_MENTION",
      title: `${authorName} mentioned you`,
      message: `${authorName} mentioned you in a discussion on "${paperTitle}": "${snippet}"`,
      link: `/papers/${paper.id}`,
      data: {
        paper_id: paper.id,
        thread_id: threadId,
        author_id: author?.id,
      },
    });
    if (notif) notifications.push(notif);
  }

  return notifications;
}
