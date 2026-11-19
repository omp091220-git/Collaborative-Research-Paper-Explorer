import pool from '../config/database.js';

// Every public discovery lookup uses both visibility boundaries. No viewer role,
// ownership or private-post permission can widen these public queries.
const projection = `p.id, p.author_id, p.paper_id, p.title, p.content,
 p.visibility, p.tags, p.like_count, p.comment_count, p.created_at, p.updated_at,
 u.full_name AS author_name, pap.title AS paper_title`;
const tables = `FROM posts p INNER JOIN users u ON p.author_id = u.id
 LEFT JOIN papers pap ON p.paper_id = pap.id`;
const visibility = `p.visibility = 'PUBLIC' AND u.account_type = 'PUBLIC'`;
const literalLike = (value) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

export function createPublicFeedRepository(db = pool) {
  return {
    async list({
      limit = 20,
      offset = 0,
      tag = null,
      paperId = null,
      q = '',
      sort = 'newest',
    } = {}) {
      const conditions = [visibility],
        values = [];
      if (tag) {
        values.push(tag);
        conditions.push(`$${values.length} = ANY(p.tags)`);
      }
      if (paperId) {
        values.push(paperId);
        conditions.push(`p.paper_id = $${values.length}`);
      }
      if (q) {
        values.push(literalLike(q));
        const arg = `$${values.length}`;
        conditions.push(`(p.title ILIKE ${arg} OR p.content ILIKE ${arg} OR u.full_name ILIKE ${arg}
     OR EXISTS (SELECT 1 FROM unnest(p.tags) AS topic WHERE topic ILIKE ${arg}))`);
      }
      const where = `WHERE ${conditions.join(' AND ')}`;
      const filterValues = [...values];
      values.push(limit, offset);
      const direction = sort === 'oldest' ? 'ASC' : 'DESC';
      const [posts, count] = await Promise.all([
        db.query(
          `SELECT ${projection} ${tables} ${where}
     ORDER BY p.created_at ${direction}, p.id ${direction} LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        ),
        db.query(`SELECT COUNT(*) AS total ${tables} ${where}`, filterValues),
      ]);
      return { posts: posts.rows, total: Number(count.rows[0]?.total || 0) };
    },
    async findPublicById(id) {
      return (
        (
          await db.query(
            `SELECT ${projection} ${tables} WHERE ${visibility} AND p.id=$1 LIMIT 1`,
            [id],
          )
        ).rows[0] || null
      );
    },
  };
}
export default createPublicFeedRepository();
