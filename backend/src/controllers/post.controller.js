import publicFeedService from "../services/publicFeed.service.js";
import { isPgConnectionError } from "../utils/pgClientErrors.js";

const publicFeedFailure = (error, res, next) => {
  if (isPgConnectionError(error) || ["42P01", "42703", "57014"].includes(error.code)) {
    console.error("Public feed unavailable:", error.code);
    return res.status(503).json({ error: "Public feed is temporarily unavailable. Please try again later." });
  }
  return next(error);
};
import {
  createPostService,
  getPostByIdService,
  listPublicPostsService,
  listPostsByAuthorService,
  updatePostService,
  deletePostService,
  getUserAccountTypeService,
  updateUserAccountTypeService,
} from "../services/post.service.js";

/**
 * ============================================================================
 * Post & Account Type Controller
 * Feature: FR-25 - Account Type & Post Visibility
 * ============================================================================
 * Handles HTTP requests, parameter extraction, and status code responses.
 */

/**
 * Handles creation of a new research post.
 * POST /api/posts
 */
export const createPost = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const post = await createPostService(userId, req.body);
    return res.status(201).json({
      success: true,
      message: "Post created successfully.",
      post,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves a single post by ID with visibility access control.
 * GET /api/posts/:id
 */
export const getPostById = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const { id } = req.params;
    const viewer = req.user || null;
    const post = await getPostByIdService(id, viewer);
    return res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves the public discovery feed of posts.
 * GET /api/posts
 */
export const listPublicPosts = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const feed = await listPublicPostsService(req.query);
    return res.status(200).json({
      success: true,
      ...feed,
    });
  } catch (error) {
    return publicFeedFailure(error, res, next);
  }
};

/**
 * Retrieves posts created by a specific author.
 * GET /api/posts/author/:authorId
 */
export const listPostsByAuthor = async (req, res, next) => {
  try {
    const { authorId } = req.params;
    const { limit, offset } = req.query;
    const viewer = req.user || null;
    const result = await listPostsByAuthorService(authorId, viewer, { limit, offset });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates an existing post.
 * PATCH /api/posts/:id
 */
export const updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const updated = await updatePostService(id, userId, userRole, req.body);
    return res.status(200).json({
      success: true,
      message: "Post updated successfully.",
      post: updated,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Deletes a post.
 * DELETE /api/posts/:id
 */
export const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const result = await deletePostService(id, userId, userRole);
    return res.status(200).json({
      success: true,
      message: result.message,
      id: result.id,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves the authenticated user's current account privacy type.
 * GET /api/users/me/account-type
 */
export const getMyAccountType = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const accountInfo = await getUserAccountTypeService(userId);
    return res.status(200).json({
      success: true,
      ...accountInfo,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates the authenticated user's account privacy type.
 * PATCH /api/users/me/account-type
 */
export const updateMyAccountType = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { account_type } = req.body;
    const result = await updateUserAccountTypeService(userId, account_type);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

// Public detail views never use owner/admin access to reveal private posts.
export const getPublicPost = async (req,res,next) => {
 try {
  res.set("Cache-Control","no-store");
  const post=await publicFeedService.detail(req.params.id);
  return res.json({success:true,post});
 } catch(error) {return publicFeedFailure(error,res,next);}
};
