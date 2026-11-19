import repository from "../repositories/privatePost.repository.js";
import { validateUpdatePostInput } from "../utils/postValidation.js";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (statusCode, message, code) => {
  throw Object.assign(new Error(message), { statusCode, code });
};
const validId = (id) => {
  if (typeof id !== "string" || !uuid.test(id))
    fail(400, "Invalid post or user ID.");
};
const isPrivate = (post) =>
  post.visibility === "PRIVATE" || post.author_account_type === "PRIVATE";
const capabilities = (post, actor, permission) => {
  const owner = post.author_id === actor?.id;
  const admin = ["SYSTEM_ADMIN", "SYSTEM ADMIN"].includes(actor?.role);
  return {
    can_edit: owner || admin || (isPrivate(post) && permission === "WRITE"),
    can_manage: owner || admin,
    can_delete: owner || admin,
    access: owner
      ? "OWNER"
      : admin
        ? "ADMIN"
        : isPrivate(post)
          ? permission
          : "PUBLIC",
  };
};
const authorize = ({ post, actor, permission }) => {
  if (!actor) fail(401, "Please sign in again.");
  if (!post) fail(404, "Post unavailable or access removed.");
  const rights = capabilities(post, actor, permission);
  if (isPrivate(post) && !rights.can_manage && !permission)
    fail(404, "Post unavailable or access removed.");
  return rights;
};
const bodyObject = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(400, "A JSON object is required.");
};
const onlyKeys = (body, keys) => {
  bodyObject(body);
  if (Object.keys(body).some((key) => !keys.includes(key)))
    fail(400, "Unsupported field in request.");
};
export function createPrivatePostService(repo = repository) {
  const locked = (id, userId, action) => {
    validId(id);
    return repo.withPost(id, userId, action);
  };
  const managed = (context) => {
    const rights = authorize(context);
    if (!rights.can_manage)
      fail(403, "Only the owner or an administrator can manage sharing.");
    if (!isPrivate(context.post))
      fail(409, "Sharing permissions apply to private posts only.");
    return rights;
  };
  return {
    async list(userId, query = {}) {
      if (Object.keys(query).some((k) => !["limit", "offset"].includes(k)))
        fail(400, "Unsupported list filter.");
      const integer = (v, fallback, min, max) => {
        if (v === undefined) return fallback;
        if (
          typeof v !== "string" ||
          !/^\d+$/.test(v) ||
          Number(v) < min ||
          Number(v) > max
        )
          fail(400, "Invalid pagination.");
        return Number(v);
      };
      const limit = integer(query.limit, 20, 1, 100),
        offset = integer(query.offset, 0, 0, 1000000);
      const result = await repo.list(userId, limit, offset);
      return {
        ...result,
        limit,
        offset,
        posts: result.posts.map(({ permission_level, total, ...post }) => ({
          ...post,
          ...capabilities(post, { id: userId }, permission_level),
        })),
      };
    },
    detail: (id, userId) =>
      locked(id, userId, async (context) => ({
        ...context.post,
        ...authorize(context),
      })),
    permissions: (id, userId) =>
      locked(id, userId, async (context) => {
        managed(context);
        return (
          await context.client.query(
            `SELECT pp.user_id,pp.permission_level,pp.created_at,pp.updated_at,
        u.full_name,u.email FROM post_permissions pp JOIN users u ON u.id=pp.user_id
        WHERE pp.post_id=$1 ORDER BY pp.created_at,pp.user_id`,
            [id],
          )
        ).rows;
      }),
    grant: (id, userId, body) =>
      locked(id, userId, async (context) => {
        managed(context);
        onlyKeys(body, ["email", "permission_level"]);
        if (
          typeof body.email !== "string" ||
          body.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
        )
          fail(400, "Enter a valid registered email address.");
        if (!["READ", "WRITE"].includes(body.permission_level))
          fail(400, "Permission must be READ or WRITE.");
        const target = (
          await context.client.query(
            "SELECT id,full_name,email FROM users WHERE LOWER(email)=LOWER($1)",
            [body.email.trim()],
          )
        ).rows[0];
        if (!target)
          fail(
            404,
            "No registered user has that email address.",
            "POST_RECIPIENT_NOT_FOUND",
          );
        if (target.id === context.post.author_id)
          fail(400, "The owner already has full access.");
        await context.client.query(
          `INSERT INTO post_permissions(post_id,user_id,permission_level,granted_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(post_id,user_id) DO UPDATE SET permission_level=EXCLUDED.permission_level,
        granted_by=EXCLUDED.granted_by,updated_at=NOW()`,
          [id, target.id, body.permission_level, userId],
        );
        return {
          ...target,
          user_id: target.id,
          permission_level: body.permission_level,
        };
      }),
    revoke: (id, userId, targetId) =>
      locked(id, userId, async (context) => {
        managed(context);
        validId(targetId);
        if (targetId === context.post.author_id)
          fail(400, "Owner access cannot be revoked.");
        await context.client.query(
          "DELETE FROM post_permissions WHERE post_id=$1 AND user_id=$2",
          [id, targetId],
        );
        return { message: "Access removed." };
      }),
    edit: (id, userId, body) =>
      locked(id, userId, async (context) => {
        const rights = authorize(context);
        if (!rights.can_edit)
          fail(403, "Read-only access does not allow editing.");
        onlyKeys(
          body,
          rights.can_manage
            ? ["title", "content", "tags", "visibility", "paperId"]
            : ["title", "content", "tags"],
        );
        const validation = validateUpdatePostInput(body);
        if (!validation.isValid) fail(400, validation.errors.join(" "));
        if (
          body.tags !== undefined &&
          (!Array.isArray(body.tags) ||
            body.tags.length > 10 ||
            body.tags.some(
              (t) => typeof t !== "string" || !t.trim() || t.trim().length > 50,
            ))
        )
          fail(400, "Use up to 10 topic tags, each 1–50 characters.");
        if (
          validation.sanitized.visibility === "PUBLIC" &&
          context.post.author_account_type === "PRIVATE"
        )
          fail(403, "Private accounts cannot publish public posts.");
        const values = [],
          sets = [];
        for (const [key, value] of Object.entries(validation.sanitized)) {
          values.push(value);
          sets.push(
            `${key === "paperId" ? "paper_id" : key}=$${values.length}`,
          );
        }
        values.push(id);
        const updated = (
          await context.client.query(
            `UPDATE posts SET ${sets.join(",")},updated_at=NOW() WHERE id = $${values.length} RETURNING *`,
            values,
          )
        ).rows[0];
        return { ...updated, author_name: context.post.author_name, ...rights };
      }),
  };
}
export default createPrivatePostService();
