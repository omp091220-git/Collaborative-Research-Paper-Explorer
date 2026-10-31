/**
 * Mention Helper Utility
 * Parses @username syntax from user-generated content, resolves mentions
 * against registered users in PostgreSQL, and computes mention differences for updates.
 */

/**
 * Extracts unique lowercased usernames from a text string.
 * Supports standard syntax: @username, @user.name, @user_name, @user-name.
 *
 * @param {string|null|undefined} text
 * @returns {string[]} Array of unique, lowercased usernames.
 */
export const extractMentions = (text) => {
  if (!text || typeof text !== 'string') return [];

  // Match @username preceded by start of string, whitespace, or punctuation
  // Word characters, dots, underscores, and hyphens supported
  const mentionRegex = /(?:^|[\s(])@([a-zA-Z0-9._-]+)(?=[),:;!?\s]|$)/g;
  const matches = new Set();

  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    let username = match[1].trim().toLowerCase().replace(/[._-]+$/, '');
    // Exclude single punctuation or empty matches
    if (username && !/^[._-]+$/.test(username)) {
      matches.add(username);
    }
  }

  return Array.from(matches);
};

/**
 * Computes newly introduced mentions between old and new text.
 * Prevents re-notifying users whose mentions were already present before an edit.
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {string[]} Array of usernames newly introduced in newText.
 */
export const computeMentionDiff = (oldText, newText) => {
  const oldMentions = new Set(extractMentions(oldText));
  const newMentions = extractMentions(newText);

  return newMentions.filter((username) => !oldMentions.has(username));
};

/**
 * Resolves a list of usernames to registered user records in the database.
 * Matches against either the explicit `username` column or the email username prefix.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string[]} usernames
 * @returns {Promise<Array<{ id: string, email: string, full_name: string, username: string }>>}
 */
export const resolveMentionedUsers = async (client, usernames) => {
  if (!Array.isArray(usernames) || usernames.length === 0) return [];

  const lowerUsernames = Array.from(
    new Set(usernames.map((u) => u.toLowerCase().trim()).filter(Boolean))
  );

  if (lowerUsernames.length === 0) return [];

  const query = `
    SELECT id, email, full_name, role,
           COALESCE(username, LOWER(SPLIT_PART(email, '@', 1))) AS username
    FROM users
    WHERE LOWER(COALESCE(username, SPLIT_PART(email, '@', 1))) = ANY($1::text[])
  `;

  const result = await client.query(query, [lowerUsernames]);
  return result.rows || [];
};

/**
 * Creates a clean, safe snippet from text for notification display.
 *
 * @param {string} text
 * @param {number} [maxLength=120]
 * @returns {string}
 */
export const formatSnippet = (text, maxLength = 120) => {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
};
