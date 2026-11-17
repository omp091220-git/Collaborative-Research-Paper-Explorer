import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";
import { ROLES } from "../utils/roles.js";
import { getValidatedJwtSecret } from "../utils/jwt.js";
import {
  validateCreatePostInput,
  validateUpdatePostInput,
  validateAccountTypeInput,
} from "../utils/postValidation.js";
import * as postService from "../services/post.service.js";

/**
 * ============================================================================
 * FR-25 Test Suite: Account Type and Post Visibility Enforcement
 * Group: Group-19 | IT314 Software Engineering
 * ============================================================================
 * Industry-standard unit and HTTP acceptance tests validating:
 * - Public accounts can create both PUBLIC and PRIVATE posts.
 * - Private accounts are strictly forbidden from creating PUBLIC posts.
 * - Read access boundaries strictly prevent unauthorized access to private posts.
 * - Public feed queries exclude private posts at the database level.
 */

describe("FR-25: Account Type and Post Visibility Test Suite", () => {
  let server;
  let baseUrl;
  let originalPoolQuery;

  // Mock Users
  const publicUser = {
    id: "c1000000-0000-4000-8000-000000000001",
    email: "public_researcher@daiict.ac.in",
    full_name: "Dr. Ada Lovelace",
    role: ROLES.RESEARCHER,
    account_type: "PUBLIC",
  };

  const privateUser = {
    id: "c2000000-0000-4000-8000-000000000002",
    email: "private_researcher@daiict.ac.in",
    full_name: "Alan Turing",
    role: ROLES.RESEARCHER,
    account_type: "PRIVATE",
  };

  const otherUser = {
    id: "c3000000-0000-4000-8000-000000000003",
    email: "curious_student@daiict.ac.in",
    full_name: "Bob Student",
    role: ROLES.STUDENT,
    account_type: "PUBLIC",
  };

  const adminUser = {
    id: "c4000000-0000-4000-8000-000000000004",
    email: "sysadmin@daiict.ac.in",
    full_name: "System Administrator",
    role: ROLES.SYSTEM_ADMIN,
    account_type: "PUBLIC",
  };

  let publicToken;
  let privateToken;
  let otherToken;
  let adminToken;

  const authHeaders = (token) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  // In-memory test store
  let mockPosts = [];
  let mockUsers = {};

  before(async () => {
    const secret = getValidatedJwtSecret();

    publicToken = jwt.sign(
      { id: publicUser.id, email: publicUser.email, role: publicUser.role },
      secret,
      { expiresIn: "1h" }
    );

    privateToken = jwt.sign(
      { id: privateUser.id, email: privateUser.email, role: privateUser.role },
      secret,
      { expiresIn: "1h" }
    );

    otherToken = jwt.sign(
      { id: otherUser.id, email: otherUser.email, role: otherUser.role },
      secret,
      { expiresIn: "1h" }
    );

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      secret,
      { expiresIn: "1h" }
    );

    // Start local test server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Mock PostgreSQL Query Interceptor
    originalPoolQuery = pool.query;
    pool.query = async (text, params) => {
      const q = text.trim();

      // 1. SELECT user by id (users query)
      if (q.includes("FROM users") && q.includes("WHERE id = $1")) {
        const uId = params[0];
        const user = mockUsers[uId];
        return { rows: user ? [user] : [] };
      }

      // 2. UPDATE users account_type
      if (q.includes("UPDATE users") && q.includes("SET account_type = $2")) {
        const uId = params[0];
        const targetType = params[1];
        if (mockUsers[uId]) {
          mockUsers[uId].account_type = targetType;
          return { rows: [mockUsers[uId]] };
        }
        return { rows: [] };
      }

      // 3. INSERT INTO posts
      if (q.includes("INSERT INTO posts")) {
        const [author_id, title, content, paper_id, visibility, tags] = params;
        const newPost = {
          id: `post-0000-0000-0000-${String(mockPosts.length + 1).padStart(12, "0")}`,
          author_id,
          paper_id: paper_id || null,
          title,
          content,
          visibility,
          tags: tags || [],
          like_count: 0,
          comment_count: 0,
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockPosts.push(newPost);
        return { rows: [newPost] };
      }

      // 4. SELECT post by id (with author join)
      if (q.includes("FROM posts p") && q.includes("WHERE p.id = $1")) {
        const pId = params[0];
        const post = mockPosts.find((p) => p.id === pId);
        if (!post) return { rows: [] };

        const author = mockUsers[post.author_id] || {};
        return {
          rows: [
            {
              ...post,
              author_name: author.full_name || "Unknown Author",
              author_email: author.email || "unknown@test.edu",
              author_role: author.role || ROLES.RESEARCHER,
              author_account_type: author.account_type || "PUBLIC",
              paper_title: post.paper_id ? "Sample Research Paper" : null,
            },
          ],
        };
      }

      // 5. SELECT public posts (Feed)
      if (q.includes("FROM posts p") && q.includes("p.visibility = 'PUBLIC'")) {
        let filtered = mockPosts.filter((p) => p.visibility === "PUBLIC");

        if (q.includes("SELECT COUNT(*)")) {
          return { rows: [{ total: String(filtered.length) }] };
        }

        const enriched = filtered.map((p) => {
          const author = mockUsers[p.author_id] || {};
          return {
            ...p,
            author_name: author.full_name,
            author_email: author.email,
            author_role: author.role,
          };
        });
        return { rows: enriched };
      }

      // 6. SELECT posts by author
      if (q.includes("FROM posts p") && q.includes("p.author_id = $1")) {
        const authorId = params[0];
        const onlyPublic = q.includes("p.visibility = 'PUBLIC'");
        let filtered = mockPosts.filter((p) => p.author_id === authorId);
        if (onlyPublic) {
          filtered = filtered.filter((p) => p.visibility === "PUBLIC");
        }

        if (q.includes("SELECT COUNT(*)")) {
          return { rows: [{ total: String(filtered.length) }] };
        }

        const enriched = filtered.map((p) => {
          const author = mockUsers[p.author_id] || {};
          return {
            ...p,
            author_name: author.full_name,
            author_email: author.email,
            author_role: author.role,
          };
        });
        return { rows: enriched };
      }

      // 7. UPDATE post
      if (q.includes("UPDATE posts") && q.includes("WHERE id =")) {
        const pId = params[params.length - 1];
        const post = mockPosts.find((p) => p.id === pId);
        if (!post) return { rows: [] };

        // Simple mock field assignment
        if (params.includes("PUBLIC") || params.includes("PRIVATE")) {
          const vis = params.find((x) => x === "PUBLIC" || x === "PRIVATE");
          if (vis) post.visibility = vis;
        }
        post.updated_at = new Date();
        return { rows: [post] };
      }

      // 8. DELETE post
      if (q.includes("DELETE FROM posts")) {
        const pId = params[0];
        const idx = mockPosts.findIndex((p) => p.id === pId);
        if (idx !== -1) {
          mockPosts.splice(idx, 1);
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      // 9. post_permissions check
      if (q.includes("FROM post_permissions")) {
        return { rows: [] };
      }

      return { rows: [] };
    };
  });

  beforeEach(() => {
    // Reset test users
    mockUsers = {
      [publicUser.id]: { ...publicUser },
      [privateUser.id]: { ...privateUser },
      [otherUser.id]: { ...otherUser },
      [adminUser.id]: { ...adminUser },
    };

    // Pre-populate with standard posts
    mockPosts = [
      {
        id: "post-0000-0000-0000-000000000001",
        author_id: publicUser.id,
        paper_id: null,
        title: "Introduction to Quantum Graph Neural Networks",
        content: "A quick review of Hamiltonian graph embeddings for topological data analysis.",
        visibility: "PUBLIC",
        tags: ["quantum", "gnn"],
        like_count: 3,
        comment_count: 1,
        created_at: new Date(Date.now() - 3600000),
        updated_at: new Date(Date.now() - 3600000),
      },
      {
        id: "post-0000-0000-0000-000000000002",
        author_id: publicUser.id,
        paper_id: null,
        title: "Confidential Lab Scratchpad",
        content: "Unpublished pre-print notes on asymptotic convergence bounds.",
        visibility: "PRIVATE",
        tags: ["internal"],
        like_count: 0,
        comment_count: 0,
        created_at: new Date(Date.now() - 1800000),
        updated_at: new Date(Date.now() - 1800000),
      },
      {
        id: "post-0000-0000-0000-000000000003",
        author_id: privateUser.id,
        paper_id: null,
        title: "Private Account Research Diary",
        content: "Private thoughts on cryptographic zero-knowledge proof verification.",
        visibility: "PRIVATE",
        tags: ["zkp", "crypto"],
        like_count: 0,
        comment_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
  });

  after(async () => {
    pool.query = originalPoolQuery;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // 1. Unit Tests: Input Validation & Sanitization
  // ==========================================================================
  describe("1. Validation & Input Utility Tests", () => {
    it("1.1 validateCreatePostInput passes for valid public post", () => {
      const res = validateCreatePostInput({
        title: "Attention Mechanics in Deep Networks",
        content: "Detailed analysis of Transformer Multi-Head Self-Attention layers.",
        visibility: "PUBLIC",
        tags: ["transformers", "attention"],
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.sanitized.title, "Attention Mechanics in Deep Networks");
      assert.strictEqual(res.sanitized.visibility, "PUBLIC");
      assert.strictEqual(res.sanitized.tags.length, 2);
    });

    it("1.2 validateCreatePostInput rejects empty or too-short title", () => {
      const res = validateCreatePostInput({
        title: "ab",
        content: "Valid content string for the test.",
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes("title must be at least 3 characters")));
    });

    it("1.3 validateCreatePostInput rejects invalid visibility level", () => {
      const res = validateCreatePostInput({
        title: "Valid Post Title",
        content: "Valid content with sufficient length.",
        visibility: "RESTRICTED",
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes("Invalid post visibility")));
    });

    it("1.4 validateAccountTypeInput accepts PUBLIC and PRIVATE only", () => {
      const validPublic = validateAccountTypeInput("PUBLIC");
      assert.strictEqual(validPublic.isValid, true);
      assert.strictEqual(validPublic.sanitized, "PUBLIC");

      const validPrivate = validateAccountTypeInput("private");
      assert.strictEqual(validPrivate.isValid, true);
      assert.strictEqual(validPrivate.sanitized, "PRIVATE");

      const invalid = validateAccountTypeInput("UNRESTRICTED");
      assert.strictEqual(invalid.isValid, false);
      assert.ok(invalid.error.includes("Allowed options are: PUBLIC, PRIVATE"));
    });
  });

  // ==========================================================================
  // 2. Unit Tests: Core Business Logic (Service Layer)
  // ==========================================================================
  describe("2. FR-25 Service Layer Business Rule Enforcement", () => {
    it("2.1 Public-account user can create a PUBLIC post", async () => {
      const post = await postService.createPostService(publicUser.id, {
        title: "Public Empirical Benchmark",
        content: "Open-source benchmark results for academic evaluation.",
        visibility: "PUBLIC",
      });
      assert.strictEqual(post.visibility, "PUBLIC");
      assert.strictEqual(post.author_account_type, "PUBLIC");
    });

    it("2.2 Public-account user can create a PRIVATE post", async () => {
      const post = await postService.createPostService(publicUser.id, {
        title: "Draft Hypothesis Notes",
        content: "Private initial draft not ready for peer review.",
        visibility: "PRIVATE",
      });
      assert.strictEqual(post.visibility, "PRIVATE");
      assert.strictEqual(post.author_account_type, "PUBLIC");
    });

    it("2.3 Private-account user can create a PRIVATE post", async () => {
      const post = await postService.createPostService(privateUser.id, {
        title: "Private Author Manuscript",
        content: "Confidential working notes.",
        visibility: "PRIVATE",
      });
      assert.strictEqual(post.visibility, "PRIVATE");
      assert.strictEqual(post.author_account_type, "PRIVATE");
    });

    it("2.4 STRICT FR-25 RULE: Private-account user creating a PUBLIC post throws 403 Forbidden", async () => {
      await assert.rejects(
        async () => {
          await postService.createPostService(privateUser.id, {
            title: "Attempted Leak of Public Post",
            content: "This should be blocked because the user account is private.",
            visibility: "PUBLIC",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.ok(err.message.includes("Private-account users are only permitted to create private posts"));
          return true;
        }
      );
    });

    it("2.5 Author can retrieve their own private post", async () => {
      const post = await postService.getPostByIdService(
        "post-0000-0000-0000-000000000002",
        { id: publicUser.id, role: publicUser.role }
      );
      assert.strictEqual(post.id, "post-0000-0000-0000-000000000002");
      assert.strictEqual(post.visibility, "PRIVATE");
    });

    it("2.6 Third-party user cannot retrieve a private post (403 Forbidden)", async () => {
      await assert.rejects(
        async () => {
          await postService.getPostByIdService(
            "post-0000-0000-0000-000000000002",
            { id: otherUser.id, role: otherUser.role }
          );
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.ok(err.message.includes("Access denied. This is a private post"));
          return true;
        }
      );
    });

    it("2.7 SYSTEM_ADMIN can view private post for moderation and auditing", async () => {
      const post = await postService.getPostByIdService(
        "post-0000-0000-0000-000000000002",
        { id: adminUser.id, role: adminUser.role }
      );
      assert.strictEqual(post.id, "post-0000-0000-0000-000000000002");
    });
  });

  // ==========================================================================
  // 3. HTTP Integration & Acceptance Tests
  // ==========================================================================
  describe("3. HTTP Endpoints & Acceptance Tests (FR-25)", () => {
    it("3.1 POST /api/posts: rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Unauthorized Post",
          content: "Content attempting to bypass authentication.",
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("3.2 POST /api/posts: public account creates PUBLIC post with 201 Created", async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: authHeaders(publicToken),
        body: JSON.stringify({
          title: "Evaluating Transformers with KaTeX",
          content: "Mathematical derivations using AMS-LaTeX formatting.",
          visibility: "PUBLIC",
          tags: ["katex", "math"],
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.post.visibility, "PUBLIC");
    });

    it("3.3 POST /api/posts: public account creates PRIVATE post with 201 Created", async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: authHeaders(publicToken),
        body: JSON.stringify({
          title: "Internal Proof Drafting",
          content: "Confidential derivations for internal lab use only.",
          visibility: "PRIVATE",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.post.visibility, "PRIVATE");
    });

    it("3.4 POST /api/posts: private account creates PRIVATE post with 201 Created", async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: authHeaders(privateToken),
        body: JSON.stringify({
          title: "Private Researcher Thought Stream",
          content: "Valid private content from a private account user.",
          visibility: "PRIVATE",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.post.visibility, "PRIVATE");
    });

    it("3.5 POST /api/posts: private account attempting PUBLIC post receives 403 Forbidden (FR-25 Acceptance)", async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        method: "POST",
        headers: authHeaders(privateToken),
        body: JSON.stringify({
          title: "Forbidden Public Post",
          content: "This must fail because the account type is PRIVATE.",
          visibility: "PUBLIC",
        }),
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes("Private-account users are only permitted to create private posts"));
    });

    it("3.6 GET /api/posts/:id: returns 200 for PUBLIC post even to anonymous or third party", async () => {
      const res = await fetch(`${baseUrl}/api/posts/post-0000-0000-0000-000000000001`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.post.visibility, "PUBLIC");
    });

    it("3.7 GET /api/posts/:id: returns 403 for unauthorized user accessing PRIVATE post", async () => {
      const res = await fetch(`${baseUrl}/api/posts/post-0000-0000-0000-000000000002`, {
        headers: authHeaders(otherToken),
      });
      assert.strictEqual(res.status, 403);
    });

    it("3.8 GET /api/posts/:id: returns 200 when author accesses their own PRIVATE post", async () => {
      const res = await fetch(`${baseUrl}/api/posts/post-0000-0000-0000-000000000002`, {
        headers: authHeaders(publicToken),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.post.id, "post-0000-0000-0000-000000000002");
    });

    it("3.9 GET /api/posts: public feed excludes all private posts", async () => {
      const res = await fetch(`${baseUrl}/api/posts`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.posts.length > 0);
      // Ensure zero private posts are present in public feed
      const hasPrivate = data.posts.some((p) => p.visibility === "PRIVATE");
      assert.strictEqual(hasPrivate, false);
    });

    it("3.10 PATCH /api/users/me/account-type: toggles account type to PRIVATE", async () => {
      const res = await fetch(`${baseUrl}/api/users/me/account-type`, {
        method: "PATCH",
        headers: authHeaders(publicToken),
        body: JSON.stringify({ account_type: "PRIVATE" }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.user.account_type, "PRIVATE");
    });

    it("3.11 GET /api/users/me/account-type: retrieves authenticated user's account type", async () => {
      const res = await fetch(`${baseUrl}/api/users/me/account-type`, {
        headers: authHeaders(privateToken),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.account_type, "PRIVATE");
    });
  });
});
