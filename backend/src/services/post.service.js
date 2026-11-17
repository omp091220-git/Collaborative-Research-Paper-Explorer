import {
  insertPost,
  findPostById,
  findPublicPosts,
  findPostsByAuthor,
  updatePostRecord,
  deletePostRecord,
  checkPostPermission,
} from "../repositories/post.repository.js";

import {
  getUserAccountType,
  updateUserAccountType,
} from "../repositories/userAccount.repository.js";

import {
  validateCreatePostInput,
  validateUpdatePostInput,
  validateAccountTypeInput,
} from "../utils/postValidation.js";

/**
 * ============================================================================
 * Post Service
 * Feature: FR-25 - Account Type and Post Visibility Enforcement
 * ============================================================================
 * Implements the core business rules mandated by IT314 specification:
 * - Public accounts may choose either PUBLIC or PRIVATE visibility.
 * - Private accounts are strictly restricted to PRIVATE post creation.
 * - Server-side access control guarantees private posts are unviewable by
 *   unauthorized third parties.
 */

/**
 * Creates a new research post while enforcing the FR-25 account type constraints.
 *
 * @param {string} userId - UUID of the authenticated author.
 * @param {Object} rawInput - Post input payload.
 * @returns {Promise<Object>} Created post.
 * @throws {Error} 400 Validation Error | 403 Forbidden Error | 404 Not Found
 */
export const createPostService = async (userId, rawInput) => {
  // 1. Validate payload structure and constraints
  const validation = validateCreatePostInput(rawInput);
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(" "));
    error.statusCode = 400;
    throw error;
  }

  const { title, content, visibility, tags, paperId } = validation.sanitized;

  // 2. Fetch the author's account type directly from database
  const user = await getUserAccountType(userId);
  if (!user) {
    const error = new Error("Authenticated user profile was not found.");
    error.statusCode = 404;
    throw error;
  }

  const userAccountType = user.account_type || "PUBLIC";

  // 3. CORE FR-25 ENFORCEMENT RULE:
  // "Private-account users shall only be allowed to create private posts."
  let finalVisibility = visibility;

  if (userAccountType === "PRIVATE") {
    if (visibility === "PUBLIC") {
      const error = new Error(
        "Forbidden: Private-account users are only permitted to create private posts. " +
        "To publish public posts, switch your account type to PUBLIC in your profile settings."
      );
      error.statusCode = 403;
      throw error;
    }
    // Private accounts default to PRIVATE visibility unconditionally
    finalVisibility = "PRIVATE";
  }

  // 4. Insert post via repository
  const createdPost = await insertPost({
    authorId: userId,
    title,
    content,
    paperId,
    visibility: finalVisibility,
    tags,
  });

  return {
    ...createdPost,
    author_name: user.full_name,
    author_email: user.email,
    author_account_type: userAccountType,
  };
};

/**
 * Retrieves a single post by ID while enforcing privacy access boundaries.
 *
 * @param {string} postId - UUID of target post.
 * @param {Object|null} viewerUser - Authenticated user details { id, role } or null for guests.
 * @returns {Promise<Object>} Post data.
 * @throws {Error} 404 Not Found | 403 Forbidden
 */
export const getPostByIdService = async (postId, viewerUser = null) => {
  const post = await findPostById(postId);
  if (!post) {
    const error = new Error("Post not found.");
    error.statusCode = 404;
    throw error;
  }

  // 1. Public posts can be viewed by anyone
  if (post.visibility === "PUBLIC") {
    return post;
  }

  // 2. Private post access enforcement
  if (!viewerUser || !viewerUser.id) {
    const error = new Error("Access denied. Please log in to view this private post.");
    error.statusCode = 401;
    throw error;
  }

  // Author can always view their own private posts
  if (post.author_id === viewerUser.id) {
    return post;
  }

  // System Administrator can view for moderation/auditing
  if (viewerUser.role === "SYSTEM_ADMIN" || viewerUser.role === "SYSTEM ADMIN") {
    return post;
  }

  // FR-30 check: Check explicit user permission on this post
  const hasPermission = await checkPostPermission(postId, viewerUser.id, "READ");
  if (hasPermission) {
    return post;
  }

  const error = new Error("Access denied. This is a private post and you do not have permission to view it.");
  error.statusCode = 403;
  throw error;
};

/**
 * Lists public posts for the social discovery feed (FR-26 foundation).
 *
 * @param {Object} queryOptions
 * @returns {Promise<{ posts: Object[], total: number, limit: number, offset: number }>}
 */
export const listPublicPostsService = async (queryOptions = {}) => {
  const limit = Math.min(Math.max(parseInt(queryOptions.limit || 20, 10), 1), 100);
  const offset = Math.max(parseInt(queryOptions.offset || 0, 10), 0);
  const tag = queryOptions.tag ? String(queryOptions.tag).trim().toLowerCase() : null;
  const paperId = queryOptions.paperId || null;

  const result = await findPublicPosts({
    limit,
    offset,
    tag,
    paperId,
  });

  return {
    posts: result.posts,
    total: result.total,
    limit,
    offset,
  };
};

/**
 * Lists posts by a specific author respecting privacy filters based on who is viewing.
 *
 * @param {string} authorId - UUID of the post author.
 * @param {Object|null} viewerUser - Authenticated user details { id, role } or null.
 * @param {Object} queryOptions - Pagination options.
 * @returns {Promise<{ posts: Object[], total: number, limit: number, offset: number }>}
 */
export const listPostsByAuthorService = async (authorId, viewerUser = null, queryOptions = {}) => {
  const limit = Math.min(Math.max(parseInt(queryOptions.limit || 20, 10), 1), 100);
  const offset = Math.max(parseInt(queryOptions.offset || 0, 10), 0);

  // Author themselves or an admin can see their own private posts
  const isAuthor = viewerUser && viewerUser.id === authorId;
  const isAdmin = viewerUser && (viewerUser.role === "SYSTEM_ADMIN" || viewerUser.role === "SYSTEM ADMIN");
  const canViewPrivate = isAuthor || isAdmin;

  const result = await findPostsByAuthor({
    authorId,
    canViewPrivate,
    limit,
    offset,
  });

  return {
    posts: result.posts,
    total: result.total,
    limit,
    offset,
  };
};

/**
 * Updates a post while re-validating author ownership and visibility constraints.
 *
 * @param {string} postId - UUID of the post.
 * @param {string} userId - UUID of authenticated user.
 * @param {string} userRole - Role of authenticated user.
 * @param {Object} updatePayload - Requested updates.
 * @returns {Promise<Object>} Updated post.
 */
export const updatePostService = async (postId, userId, userRole, updatePayload) => {
  const post = await findPostById(postId);
  if (!post) {
    const error = new Error("Post not found.");
    error.statusCode = 404;
    throw error;
  }

  // Authorization check: only author or SYSTEM_ADMIN can update
  const isAuthor = post.author_id === userId;
  const isAdmin = userRole === "SYSTEM_ADMIN" || userRole === "SYSTEM ADMIN";

  if (!isAuthor && !isAdmin) {
    const error = new Error("Forbidden: You are not authorized to update this post.");
    error.statusCode = 403;
    throw error;
  }

  const validation = validateUpdatePostInput(updatePayload);
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(" "));
    error.statusCode = 400;
    throw error;
  }

  // If changing visibility to PUBLIC, check author account type
  if (validation.sanitized.visibility === "PUBLIC") {
    const author = await getUserAccountType(post.author_id);
    if (author && author.account_type === "PRIVATE") {
      const error = new Error(
        "Forbidden: Cannot change post visibility to PUBLIC because the author has a PRIVATE account."
      );
      error.statusCode = 403;
      throw error;
    }
  }

  const updated = await updatePostRecord(postId, validation.sanitized);
  return updated;
};

/**
 * Deletes a post verifying author ownership or administrator authority.
 *
 * @param {string} postId - UUID of post.
 * @param {string} userId - UUID of authenticated user.
 * @param {string} userRole - Role of authenticated user.
 * @returns {Promise<{ message: string, id: string }>}
 */
export const deletePostService = async (postId, userId, userRole) => {
  const post = await findPostById(postId);
  if (!post) {
    const error = new Error("Post not found.");
    error.statusCode = 404;
    throw error;
  }

  const isAuthor = post.author_id === userId;
  const isAdmin = userRole === "SYSTEM_ADMIN" || userRole === "SYSTEM ADMIN";

  if (!isAuthor && !isAdmin) {
    const error = new Error("Forbidden: You are not authorized to delete this post.");
    error.statusCode = 403;
    throw error;
  }

  await deletePostRecord(postId);
  return {
    message: "Post deleted successfully.",
    id: postId,
  };
};

/**
 * Retrieves the account privacy type for the authenticated user.
 *
 * @param {string} userId - UUID of user.
 * @returns {Promise<Object>}
 */
export const getUserAccountTypeService = async (userId) => {
  const user = await getUserAccountType(userId);
  if (!user) {
    const error = new Error("User profile not found.");
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    account_type: user.account_type || "PUBLIC",
  };
};

/**
 * Modifies the user's account privacy type ('PUBLIC' <-> 'PRIVATE').
 *
 * @param {string} userId - UUID of user.
 * @param {string} requestedType - 'PUBLIC' or 'PRIVATE'.
 * @returns {Promise<Object>} Updated account type response.
 */
export const updateUserAccountTypeService = async (userId, requestedType) => {
  const validation = validateAccountTypeInput(requestedType);
  if (!validation.isValid) {
    const error = new Error(validation.error);
    error.statusCode = 400;
    throw error;
  }

  const updated = await updateUserAccountType(userId, validation.sanitized);
  if (!updated) {
    const error = new Error("User profile not found.");
    error.statusCode = 404;
    throw error;
  }

  return {
    message: `Account type successfully updated to ${validation.sanitized}.`,
    user: updated,
  };
};
