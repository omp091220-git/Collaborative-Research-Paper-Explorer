import pool from "../config/database.js";

const fields = `p.id,p.author_id,p.paper_id,p.title,p.content,p.tags,p.visibility,
 p.created_at,p.updated_at,p.like_count,p.comment_count,u.full_name AS author_name,
 u.account_type AS author_account_type`;

export function createPrivatePostRepository(db = pool) {
  return {
    async withPost(postId, userId, operation) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        // Grants, revocations and collaborator edits take the same lock. A queued
        // edit must recheck its permission after a revocation commits.
        const { rows } = await client.query(
          `SELECT ${fields} FROM posts p
          JOIN users u ON u.id=p.author_id WHERE p.id = $1 FOR UPDATE OF p`,
          [postId],
        );
        const actor = (
          await client.query("SELECT id,role FROM users WHERE id = $1", [
            userId,
          ])
        ).rows[0];
        const permission = (
          await client.query(
            "SELECT permission_level FROM post_permissions WHERE post_id=$1 AND user_id=$2",
            [postId, userId],
          )
        ).rows[0]?.permission_level;
        const result = await operation({
          client,
          post: rows[0],
          actor,
          permission,
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async list(userId, limit, offset) {
      const where = `FROM posts p JOIN users u ON u.id=p.author_id
        LEFT JOIN post_permissions pp ON pp.post_id=p.id AND pp.user_id=$1
        WHERE p.author_id=$1 OR (pp.user_id=$1 AND (p.visibility='PRIVATE' OR u.account_type='PRIVATE'))`;
      const result = await db.query(
        `SELECT ${fields},pp.permission_level,
        COUNT(*) OVER()::int AS total ${where}
        ORDER BY p.updated_at DESC,p.id DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
      const total = result.rows.length
        ? result.rows[0].total
        : Number(
            (await db.query(`SELECT COUNT(*) ${where}`, [userId])).rows[0]
              .count,
          );
      return { posts: result.rows, total };
    },
  };
}
export default createPrivatePostRepository();
