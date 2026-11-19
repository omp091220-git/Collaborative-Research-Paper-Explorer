import repository from '../repositories/publicFeed.repository.js';
import { isValidUUID } from '../middleware/paperAccess.js';

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });
const fields = [
  'id',
  'author_id',
  'paper_id',
  'title',
  'content',
  'visibility',
  'tags',
  'like_count',
  'comment_count',
  'created_at',
  'updated_at',
  'author_name',
  'paper_title',
];
// An explicit public DTO also protects callers if a repository projection grows.
export const toPublicPost = (post) =>
  Object.fromEntries(
    fields
      .filter((key) => post[key] !== undefined)
      .map((key) => [key, post[key]]),
  );
export function validatePublicFeedQuery(input = {}) {
  const allowed = new Set(['q', 'limit', 'offset', 'tag', 'paperId', 'sort']);
  for (const key of Object.keys(input))
    if (!allowed.has(key)) throw bad('Unsupported public feed filter.');
  const string = (key, max) => {
    if (input[key] === undefined) return '';
    if (typeof input[key] !== 'string')
      throw bad(`${key} must be a single text value.`);
    const value = input[key].trim();
    if (value.length > max)
      throw bad(`${key} is too long (maximum ${max} characters).`);
    return value;
  };
  const integer = (key, fallback, min, max) => {
    if (input[key] === undefined) return fallback;
    if (typeof input[key] !== 'string' || !/^\d+$/.test(input[key]))
      throw bad(`${key} must be a whole number.`);
    const value = Number(input[key]);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw bad(`${key} must be between ${min} and ${max}.`);
    return value;
  };
  const q = string('q', 200),
    tag = string('tag', 50).toLowerCase(),
    paperId = string('paperId', 36),
    sort = string('sort', 10) || 'newest';
  if (paperId && !isValidUUID(paperId))
    throw bad('paperId must be a valid UUID.');
  if (!['newest', 'oldest'].includes(sort))
    throw bad('sort must be newest or oldest.');
  return {
    q,
    tag: tag || null,
    paperId: paperId || null,
    sort,
    limit: integer('limit', 20, 1, 100),
    offset: integer('offset', 0, 0, 1000000),
  };
}
export function createPublicFeedService(repo = repository) {
  return {
    async list(query = {}) {
      const options = validatePublicFeedQuery(query);
      const result = await repo.list(options);
      return {
        ...options,
        posts: result.posts.map(toPublicPost),
        total: result.total,
      };
    },
    async detail(id) {
      if (!isValidUUID(id)) throw bad('A valid post ID is required.');
      const post = await repo.findPublicById(id);
      if (!post)
        throw Object.assign(new Error('Public post not found.'), {
          statusCode: 404,
        });
      return toPublicPost(post);
    },
  };
}
export default createPublicFeedService();
