import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../app.js";
import pool from "../config/database.js";

const TEST_SECRET = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";

const IDS = {
  author: "a1111111-1111-4111-8111-111111111111",
  collaborator: "c3333333-3333-4333-8333-333333333333",
  outsider: "d4444444-4444-4444-8444-444444444444",
  admin: "e5555555-5555-4555-8555-555555555555",
  publicPost: "10000000-0000-4000-8000-000000000001",
  privatePost: "20000000-0000-4000-8000-000000000002",
  sharedPost: "30000000-0000-4000-8000-000000000003",
};

const SECRET_CANARY = "SECRET_UNAUTHORIZED_CANARY_DO_NOT_DISCLOSE";

function createToken(userId, role = "RESEARCHER") {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: "1h" });
}

describe("FR-29: Share Posts & References Test Suite", () => {
  const originalQuery = pool.query;

  // In-memory data store for deterministic mock execution
  let postsStore = {};
  let usersStore = {};
  let permissionsStore = {};
  let sharesStore = [];

  beforeEach(() => {
    sharesStore = [];

    usersStore = {
      [IDS.author]: {
        id: IDS.author,
        email: "author@example.edu",
        full_name: "Dr. Author Scholar",
        role: "RESEARCHER",
        account_type: "PUBLIC",
      },
      [IDS.collaborator]: {
        id: IDS.collaborator,
        email: "collab@example.edu",
        full_name: "Dr. Collaborator",
        role: "RESEARCHER",
        account_type: "PUBLIC",
      },
      [IDS.outsider]: {
        id: IDS.outsider,
        email: "outsider@example.edu",
        full_name: "Student Outsider",
        role: "STUDENT",
        account_type: "PUBLIC",
      },
      [IDS.admin]: {
        id: IDS.admin,
        email: "admin@example.edu",
        full_name: "System Administrator",
        role: "SYSTEM_ADMIN",
        account_type: "PUBLIC",
      },
    };

    postsStore = {
      [IDS.publicPost]: {
        id: IDS.publicPost,
        author_id: IDS.author,
        title: "Public Breakthrough in Quantum Computing",
        content: "We present novel error correction techniques that scale efficiently.",
        visibility: "PUBLIC",
        tags: ["quantum", "physics"],
        like_count: 5,
        comment_count: 2,
        share_count: 3,
        share_token: "s_pub_token123",
        shared_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        author_name: "Dr. Author Scholar",
        author_email: "author@example.edu",
        author_role: "RESEARCHER",
        author_account_type: "PUBLIC",
        paper_id: null,
        paper_title: null,
      },
      [IDS.privatePost]: {
        id: IDS.privatePost,
        author_id: IDS.author,
        title: `Private Proprietary Research: ${SECRET_CANARY}`,
        content: `Confidential clinical trial results. ${SECRET_CANARY}`,
        visibility: "PRIVATE",
        tags: ["confidential", "biomedical"],
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        share_token: "s_priv_token456",
        shared_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        author_name: "Dr. Author Scholar",
        author_email: "author@example.edu",
        author_role: "RESEARCHER",
        author_account_type: "PUBLIC",
        paper_id: null,
        paper_title: null,
      },
    };

    permissionsStore = {
      [`${IDS.privatePost}_${IDS.collaborator}`]: "READ",
    };

    // Intercept pool.query to simulate PostgreSQL responses
    pool.query = async (sql, params = []) => {
      const text = String(sql).replace(/\s+/g, " ").trim();

      // Session validation check
      if (text.includes("FROM user_sessions") || text.includes("FROM sessions")) {
        return { rows: [] };
      }

      // User lookup
      if (text.includes("FROM users") && text.includes("WHERE id = $1")) {
        const user = usersStore[params[0]];
        return { rows: user ? [user] : [] };
      }

      // Find post by ID
      if (text.includes("FROM posts p") && text.includes("WHERE p.id = $1")) {
        const post = postsStore[params[0]];
        return { rows: post ? [{ ...post }] : [] };
      }

      // Find post by share_token
      if (text.includes("FROM posts p") && text.includes("WHERE p.share_token = $1")) {
        const post = Object.values(postsStore).find((p) => p.share_token === params[0]);
        return { rows: post ? [{ ...post }] : [] };
      }

      // Check existing share_token
      if (text.includes("SELECT share_token FROM posts WHERE id = $1")) {
        const post = postsStore[params[0]];
        return { rows: post?.share_token ? [{ share_token: post.share_token }] : [] };
      }

      // Update share_token
      if (text.includes("UPDATE posts") && text.includes("SET share_token = $1")) {
        const post = postsStore[params[1]];
        if (post) {
          post.share_token = params[0];
          return { rows: [{ share_token: params[0] }] };
        }
        return { rows: [] };
      }

      // Atomic share counter + audit event statement
      if (text.includes("WITH updated AS") && text.includes("INSERT INTO post_shares")) {
        const post = postsStore[params[0]];
        if (!post) return { rows: [] };
        post.share_count = (post.share_count || 0) + 1;
        sharesStore.push({
          id: `share_${sharesStore.length + 1}`,
          post_id: params[0],
          user_id: params[1],
          share_type: params[2],
          commentary: params[3],
          created_at: new Date().toISOString(),
        });
        return { rows: [{ share_count: post.share_count }] };
      }

      // Increment share_count
      if (text.includes("UPDATE posts") && text.includes("SET share_count = COALESCE(share_count, 0) + 1")) {
        const post = postsStore[params[0]];
        if (post) {
          post.share_count = (post.share_count || 0) + 1;
          return { rows: [{ share_count: post.share_count }] };
        }
        return { rows: [{ share_count: 1 }] };
      }

      // Record share event in post_shares
      if (text.includes("INSERT INTO post_shares")) {
        const record = {
          id: `share_${sharesStore.length + 1}`,
          post_id: params[0],
          user_id: params[1],
          share_type: params[2],
          commentary: params[3],
          created_at: new Date().toISOString(),
        };
        sharesStore.push(record);
        return { rows: [record] };
      }

      // In-platform share post insertion
      if (text.includes("INSERT INTO posts") && text.includes("shared_post_id")) {
        const newId = `new_share_${Object.keys(postsStore).length + 1}`;
        const newPost = {
          id: newId,
          author_id: params[0],
          shared_post_id: params[1],
          title: params[2],
          content: params[3],
          visibility: params[4],
          tags: params[5] || [],
          paper_id: params[6] || null,
          like_count: 0,
          comment_count: 0,
          share_count: 0,
          share_token: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          author_name: usersStore[params[0]]?.full_name || "Scholar",
          author_email: usersStore[params[0]]?.email || "",
          author_role: usersStore[params[0]]?.role || "STUDENT",
          author_account_type: usersStore[params[0]]?.account_type || "PUBLIC",
        };
        postsStore[newId] = newPost;
        return { rows: [newPost] };
      }

      // Check post permissions
      if (text.includes("FROM post_permissions WHERE post_id = $1 AND user_id = $2")) {
        const key = `${params[0]}_${params[1]}`;
        const level = permissionsStore[key];
        return { rows: level ? [{ permission_level: level }] : [] };
      }

      // Fallback
      return { rows: [] };
    };
  });

  afterEach(() => {
    pool.query = originalQuery;
  });

  // --------------------------------------------------------------------------
  // 1. PUBLIC POST LINK SHARING & RESOLUTION
  // --------------------------------------------------------------------------
  it("allows anonymous visitor to resolve a public post via share token", async () => {
    const res = await request(app)
      .get("/api/posts/share/s_pub_token123")
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.post.id, IDS.publicPost);
    assert.equal(res.body.post.title, "Public Breakthrough in Quantum Computing");
    assert.equal(res.body.post.author_name, "Dr. Author Scholar");
    assert.equal(res.body.post.visibility, "PUBLIC");
  });

  it("generates/retrieves share link and increments share count on public post", async () => {
    const token = createToken(IDS.outsider, "STUDENT");
    const res = await request(app)
      .post(`/api/posts/${IDS.publicPost}/share`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.share_token, "s_pub_token123");
    assert.equal(res.body.share_url, "/share/posts/s_pub_token123");
    assert.equal(res.body.visibility, "PUBLIC");
    assert.ok(res.body.share_count >= 4);
    assert.equal(sharesStore.length, 1);
    assert.equal(sharesStore[0].share_type, "LINK");
  });

  it("keeps concurrent share counters aligned with recorded share events", async () => {
    const token = createToken(IDS.outsider, "STUDENT");
    const initialCount = postsStore[IDS.publicPost].share_count;
    const requests = Array.from({ length: 8 }, () =>
      request(app)
        .post(`/api/posts/${IDS.publicPost}/share`)
        .set("Authorization", `Bearer ${token}`)
    );

    const responses = await Promise.all(requests);
    responses.forEach((response) => assert.equal(response.status, 200));
    assert.equal(postsStore[IDS.publicPost].share_count, initialCount + requests.length);
    assert.equal(sharesStore.length, requests.length);
  });

  // --------------------------------------------------------------------------
  // 2. CRITICAL FR-29 SECURITY: ZERO LEAKAGE OF PRIVATE POSTS
  // --------------------------------------------------------------------------
  it("rejects unauthenticated resolution of private post link without leaking title or content", async () => {
    const res = await request(app)
      .get("/api/posts/share/s_priv_token456")
      .expect(403);

    assert.equal(res.body.is_private, true);
    // Explicit verification of zero metadata leakage
    const responseText = JSON.stringify(res.body);
    assert.ok(!responseText.includes(SECRET_CANARY), "Must not leak secret canary!");
    assert.ok(!responseText.includes("Confidential"), "Must not leak private content!");
    assert.ok(!responseText.includes("Proprietary"), "Must not leak private title!");
    assert.ok(!responseText.includes("author@example.edu"), "Must not leak email!");
  });

  it("rejects unauthorized logged-in user from resolving private post link without leaking metadata", async () => {
    const outsiderToken = createToken(IDS.outsider, "STUDENT");
    const res = await request(app)
      .get("/api/posts/share/s_priv_token456")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(403);

    assert.equal(res.body.is_private, true);
    const responseText = JSON.stringify(res.body);
    assert.ok(!responseText.includes(SECRET_CANARY), "Must not leak secret canary!");
    assert.ok(!responseText.includes("Confidential"), "Must not leak private content!");
  });

  it("allows authorized collaborator to resolve private post link with full content", async () => {
    const collabToken = createToken(IDS.collaborator, "RESEARCHER");
    const res = await request(app)
      .get("/api/posts/share/s_priv_token456")
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.post.id, IDS.privatePost);
    assert.ok(res.body.post.title.includes("Private Proprietary"));
    assert.ok(res.body.post.content.includes("Confidential"));
  });

  it("allows post owner and admin to resolve private post link", async () => {
    const authorToken = createToken(IDS.author, "RESEARCHER");
    const resAuthor = await request(app)
      .get("/api/posts/share/s_priv_token456")
      .set("Authorization", `Bearer ${authorToken}`)
      .expect(200);
    assert.equal(resAuthor.body.post.id, IDS.privatePost);

    const adminToken = createToken(IDS.admin, "SYSTEM_ADMIN");
    const resAdmin = await request(app)
      .get("/api/posts/share/s_priv_token456")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(resAdmin.body.post.id, IDS.privatePost);
  });

  // --------------------------------------------------------------------------
  // 3. SAFE LINK PREVIEWS (ZERO LEAKAGE)
  // --------------------------------------------------------------------------
  it("returns safe link preview for public posts", async () => {
    const res = await request(app)
      .get(`/api/posts/${IDS.publicPost}/preview`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.preview.preview_available, true);
    assert.equal(res.body.preview.is_private, false);
    assert.equal(res.body.preview.title, "Public Breakthrough in Quantum Computing");
  });

  it("returns redacted preview for private posts when accessed by unauthorized visitor", async () => {
    const res = await request(app)
      .get(`/api/posts/${IDS.privatePost}/preview`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.preview.preview_available, false);
    assert.equal(res.body.preview.is_private, true);
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes(SECRET_CANARY));
    assert.ok(!bodyStr.includes("Confidential"));
  });

  // --------------------------------------------------------------------------
  // 4. IN-PLATFORM SHARING BY REFERENCE (FR-29)
  // --------------------------------------------------------------------------
  it("creates an in-platform share referencing a public post with user commentary", async () => {
    const token = createToken(IDS.collaborator, "RESEARCHER");
    const res = await request(app)
      .post(`/api/posts/${IDS.publicPost}/repost`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        commentary: "Fascinating quantum results. Highly recommend this read!",
        visibility: "PUBLIC",
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.equal(res.body.post.content, "Fascinating quantum results. Highly recommend this read!");
    assert.equal(res.body.post.shared_post_id, IDS.publicPost);
    assert.equal(res.body.post.referenced_post.id, IDS.publicPost);
    assert.equal(res.body.post.referenced_post.title, "Public Breakthrough in Quantum Computing");
  });

  it("strictly forbids publicly sharing a private post (Anti-Disclosure Invariant)", async () => {
    const collabToken = createToken(IDS.collaborator, "RESEARCHER");
    const res = await request(app)
      .post(`/api/posts/${IDS.privatePost}/repost`)
      .set("Authorization", `Bearer ${collabToken}`)
      .send({
        commentary: "Attempting to leak private research into public feed.",
        visibility: "PUBLIC",
      })
      .expect(403);

    assert.ok(res.body.error.includes("Private posts cannot be shared with PUBLIC visibility"));
  });

  it("allows sharing a private post with PRIVATE visibility by an authorized collaborator", async () => {
    const collabToken = createToken(IDS.collaborator, "RESEARCHER");
    const res = await request(app)
      .post(`/api/posts/${IDS.privatePost}/repost`)
      .set("Authorization", `Bearer ${collabToken}`)
      .send({
        commentary: "Internal team discussion on confidential data.",
        visibility: "PRIVATE",
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.equal(res.body.post.visibility, "PRIVATE");
    assert.equal(res.body.post.shared_post_id, IDS.privatePost);
  });

  // --------------------------------------------------------------------------
  // 5. VALIDATION & BOUNDARY CONDITIONS
  // --------------------------------------------------------------------------
  it("returns 404 when resolving a non-existent share token", async () => {
    const res = await request(app)
      .get("/api/posts/share/s_nonexistent_token_999")
      .expect(404);

    assert.ok(res.body.error);
  });

  it("returns 400 when attempting to repost with empty commentary", async () => {
    const token = createToken(IDS.collaborator, "RESEARCHER");
    const res = await request(app)
      .post(`/api/posts/${IDS.publicPost}/repost`)
      .set("Authorization", `Bearer ${token}`)
      .send({ commentary: "   " })
      .expect(400);

    assert.ok(res.body.error.includes("provide your thoughts or commentary"));
  });
});
