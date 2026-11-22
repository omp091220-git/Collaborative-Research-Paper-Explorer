import defaultRepository from "../repositories/postShare.repository.js";
import { getUserAccountType } from "../repositories/userAccount.repository.js";
import { isValidUUID } from "../middleware/paperAccess.js";

/**
 * ============================================================================
 * Post Share Service
 * Feature: FR-29 - Share Posts & Share References
 * ============================================================================
 * Implements sharing through shareable links and in-platform references while
 * enforcing rigorous access controls to prevent unauthorized disclosure of
 * private posts and metadata.
 */

const fail = (statusCode, message, code = null, extra = {}) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  Object.assign(err, extra);
  throw err;
};

const sanitizePublicPost = (post, referencedPost = null) => ({
  id: post.id,
  author_id: post.author_id,
  author_name: post.author_name || "Scholar",
  paper_id: post.paper_id,
  paper_title: post.paper_title,
  title: post.title,
  content: post.content,
  visibility: post.visibility,
  tags: post.tags || [],
  like_count: post.like_count || 0,
  comment_count: post.comment_count || 0,
  share_count: post.share_count || 0,
  share_token: post.share_token,
  shared_post_id: post.shared_post_id,
  referenced_post: referencedPost,
  created_at: post.created_at,
  updated_at: post.updated_at,
});

export const createPostShareService = (repo = defaultRepository) => {
  /**
   * Helper: checks if a post is considered private.
   */
  const isPostPrivate = (post) =>
    post.visibility === "PRIVATE" || post.author_account_type === "PRIVATE";

  /**
   * Helper: checks if actor has permission to read a private post.
   */
  const canActorAccessPost = async (post, actor) => {
    if (!actor || !actor.id) return false;
    if (post.author_id === actor.id) return true;
    if (["SYSTEM_ADMIN", "SYSTEM ADMIN"].includes(actor.role)) return true;

    const permission = await repo.checkUserPermission(post.id, actor.id);
    return permission === "READ" || permission === "WRITE";
  };

  return {
    /**
     * Generates or retrieves a shareable reference link for a post.
     * Enforces that unauthorized users cannot obtain share links for private posts.
     */
    async getShareLink(postId, viewerUser = null) {
      if (!isValidUUID(postId)) {
        fail(400, "Invalid post ID format.");
      }

      const post = await repo.findPostById(postId);
      if (!post) {
        fail(404, "Post not found or unavailable.");
      }

      const isPrivate = isPostPrivate(post);

      if (isPrivate) {
        if (!viewerUser || !viewerUser.id) {
          fail(
            401,
            "Authentication required to share a private post.",
            "AUTH_REQUIRED",
            { is_private: true }
          );
        }

        const hasAccess = await canActorAccessPost(post, viewerUser);
        if (!hasAccess) {
          fail(
            403,
            "You do not have permission to access or share this private post.",
            "PRIVATE_POST_ACCESS_DENIED",
            { is_private: true }
          );
        }
      }

      const token = await repo.ensureShareToken(postId);
      const shareCount = await repo.incrementShareCount(postId);

      // Record share event audit
      await repo.recordShare({
        postId,
        userId: viewerUser?.id || null,
        shareType: "LINK",
      });

      return {
        post_id: postId,
        share_token: token,
        share_url: `/share/posts/${token}`,
        visibility: isPrivate ? "PRIVATE" : "PUBLIC",
        share_count: shareCount,
      };
    },

    /**
     * Resolves a shared link (by token or post UUID).
     * Strictly protects private posts against unauthorized disclosure:
     * Unauthorized requests receive 403 with NO titles, contents, or metadata.
     */
    async resolveShare(identifier, viewerUser = null) {
      if (!identifier || typeof identifier !== "string") {
        fail(400, "A share token or post ID is required.");
      }

      let post = null;
      if (isValidUUID(identifier)) {
        post = await repo.findPostById(identifier);
      } else {
        post = await repo.findPostByShareToken(identifier.trim());
      }

      if (!post) {
        fail(404, "Shared post not found or link has expired.");
      }

      const isPrivate = isPostPrivate(post);

      if (isPrivate) {
        if (!viewerUser || !viewerUser.id) {
          // Strictly redact all metadata: do not disclose title, body, or authors!
          fail(
            403,
            "This post is private. Sign in with an authorized account to view it.",
            "PRIVATE_POST_ACCESS_DENIED",
            { is_private: true, post_id: post.id }
          );
        }

        const hasAccess = await canActorAccessPost(post, viewerUser);
        if (!hasAccess) {
          // Strictly redact all metadata
          fail(
            403,
            "Access denied. You do not have permission to view this private post.",
            "PRIVATE_POST_ACCESS_DENIED",
            { is_private: true, post_id: post.id }
          );
        }

        // User is authorized to view this private post
        let referencedPost = null;
        if (post.shared_post_id) {
          try {
            referencedPost = await this.resolveShare(post.shared_post_id, viewerUser);
          } catch {
            referencedPost = null;
          }
        }

        return {
          ...post,
          referenced_post: referencedPost,
          access: post.author_id === viewerUser.id ? "OWNER" : "COLLABORATOR",
        };
      }

      // Public post: anyone (even anonymous visitors) can view
      let referencedPost = null;
      if (post.shared_post_id) {
        try {
          referencedPost = await this.resolveShare(post.shared_post_id, viewerUser);
        } catch {
          referencedPost = null;
        }
      }

      return sanitizePublicPost(post, referencedPost);
    },

    /**
     * Shares a post within the ScholarSphere platform (FR-29 in-platform sharing).
     * Creates a new post with shared_post_id referencing the original post.
     * Prevents copying private content into a public post!
     */
    async shareToPlatform(userId, postId, { commentary, visibility = "PUBLIC", tags = [] }) {
      if (!userId) {
        fail(401, "Authentication required to share posts.");
      }

      if (!isValidUUID(postId)) {
        fail(400, "Invalid post ID.");
      }

      if (!commentary || typeof commentary !== "string" || !commentary.trim()) {
        fail(400, "Please provide your thoughts or commentary when sharing a post.");
      }

      if (commentary.trim().length > 5000) {
        fail(400, "Commentary cannot exceed 5000 characters.");
      }

      const origPost = await repo.findPostById(postId);
      if (!origPost) {
        fail(404, "The post you are trying to share was not found.");
      }

      const isOrigPrivate = isPostPrivate(origPost);

      // Verify user can at least view the original post
      const user = await getUserAccountType(userId);
      if (!user) {
        fail(404, "User profile not found.");
      }

      if (isOrigPrivate) {
        const canView = await canActorAccessPost(origPost, user);
        if (!canView) {
          fail(403, "You do not have permission to view or share this private post.");
        }

        // CRITICAL FR-29 INVARIANT:
        // "Define sharing as a reference/link, not copying private content into a public location."
        if (visibility === "PUBLIC") {
          fail(
            403,
            "Forbidden: Private posts cannot be shared with PUBLIC visibility. In-platform shares of private posts must remain PRIVATE.",
            "PRIVATE_POST_LEAK_PREVENTED"
          );
        }
      }

      // FR-25 constraint: Private accounts can only create PRIVATE posts
      const userAccountType = user.account_type || "PUBLIC";
      let finalVisibility = visibility;
      if (userAccountType === "PRIVATE") {
        if (visibility === "PUBLIC") {
          fail(
            403,
            "Forbidden: Private accounts can only publish PRIVATE posts."
          );
        }
        finalVisibility = "PRIVATE";
      }

      // Create new post referencing the original post (NOT copying original post content)
      const cleanCommentary = commentary.trim();
      const newPost = await repo.createInPlatformSharePost({
        authorId: userId,
        sharedPostId: postId,
        title: `Shared: ${isOrigPrivate ? "Private Post" : origPost.title}`,
        content: cleanCommentary,
        visibility: finalVisibility,
        tags: Array.isArray(tags) ? tags : [],
        paperId: origPost.paper_id || null,
      });

      // Increment share count and record audit event
      await repo.incrementShareCount(postId);
      await repo.recordShare({
        postId,
        userId,
        shareType: "PLATFORM",
        commentary: cleanCommentary,
      });

      return {
        ...newPost,
        author_name: user.full_name,
        referenced_post: isOrigPrivate
          ? { id: origPost.id, visibility: "PRIVATE", is_private: true }
          : sanitizePublicPost(origPost),
      };
    },

    /**
     * Preview endpoint for link unfurling and card previews.
     * Guaranteed zero disclosure of private titles, authors, or text to unauthorized viewers.
     */
    async getPostPreview(identifier, viewerUser = null) {
      if (!identifier || typeof identifier !== "string") {
        fail(400, "Identifier is required.");
      }

      let post = null;
      if (isValidUUID(identifier)) {
        post = await repo.findPostById(identifier);
      } else {
        post = await repo.findPostByShareToken(identifier.trim());
      }

      if (!post) {
        fail(404, "Post not found.");
      }

      const isPrivate = isPostPrivate(post);

      if (isPrivate) {
        const hasAccess = await canActorAccessPost(post, viewerUser);
        if (!hasAccess) {
          // Strictly redacted preview
          return {
            id: post.id,
            is_private: true,
            preview_available: false,
            message: "This post is private. Permission required.",
          };
        }
      }

      // Safe preview for public or authorized viewers
      return {
        id: post.id,
        title: post.title,
        snippet: post.content ? post.content.slice(0, 160) : "",
        author_name: post.author_name || "Scholar",
        visibility: post.visibility,
        paper_id: post.paper_id,
        paper_title: post.paper_title,
        tags: post.tags || [],
        share_count: post.share_count || 0,
        is_private: false,
        preview_available: true,
        created_at: post.created_at,
      };
    },
  };
};

export default createPostShareService();
