import { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware/authenticate.js";
import { getValidatedJwtSecret } from "../utils/jwt.js";
import {
  createPost,
  getPostById,
  listPublicPosts,
  listPostsByAuthor,
  updatePost,
  deletePost,
} from "../controllers/post.controller.js";

const router = Router();

/**
 * Optional authentication middleware for public/hybrid endpoints.
 * Populates req.user if a valid token is supplied, but does not reject anonymous traffic.
 */
export const optionalAuthenticate = (req, res, next) => {
  let token = req.cookies?.token;

  if (!token && req.headers?.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.substring(7).trim();
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const secret = getValidatedJwtSecret();
    const decoded = jwt.verify(token, secret);
    if (decoded && typeof decoded === "object" && (decoded.id || decoded._id)) {
      req.user = decoded;
      if (!req.user.id && req.user._id) req.user.id = req.user._id;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }

  return next();
};

// 1. Create Post (Protected - FR-25 enforcement)
router.post("/", authenticateToken, createPost);

// 2. Public Feed / Discovery (Open - FR-26)
router.get("/", optionalAuthenticate, listPublicPosts);

// 3. Posts by Author (Hybrid: author/admin sees private posts, others see public only)
router.get("/author/:authorId", optionalAuthenticate, listPostsByAuthor);

// 4. Single Post by ID (Hybrid: public viewable by all, private checked against author/admin/permissions)
router.get("/:id", optionalAuthenticate, getPostById);

// 5. Update Post (Protected - Author/Admin only)
router.patch("/:id", authenticateToken, updatePost);

// 6. Delete Post (Protected - Author/Admin only)
router.delete("/:id", authenticateToken, deletePost);

export default router;
