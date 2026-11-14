import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";

const TEST_SECRET = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const COMMENTER_ID = "20000000-0000-4000-8000-000000000002";
const VIEWER_ID = "30000000-0000-4000-8000-000000000003";
const STRANGER_ID = "40000000-0000-4000-8000-000000000004";
const PAPER_ID = "50000000-0000-4000-8000-000000000005";
const THREAD_ID = "60000000-0000-4000-8000-000000000006";
const MESSAGE_ID = "70000000-0000-4000-8000-000000000007";

function tokenFor(id, email, role = "RESEARCHER") {
  return jwt.sign({ id, email, role }, TEST_SECRET, { expiresIn: "10m" });
}

test("FR-17 Contextual Discussions and Mentions Test Suite", async (t) => {
  const originalQuery = pool.query;

  let threads = [];
  let messages = [];
  let notifications = [];

  const papers = [
    {
      id: PAPER_ID,
      title: "Transformers for Machine Translation",
      uploader_id: OWNER_ID,
    },
  ];

  const users = [
    { id: OWNER_ID, email: "owner@example.com", full_name: "Paper Owner", role: "RESEARCHER" },
    { id: COMMENTER_ID, email: "commenter@example.com", full_name: "Commenter User", role: "RESEARCHER" },
    { id: VIEWER_ID, email: "viewer@example.com", full_name: "Viewer User", role: "STUDENT" },
    { id: STRANGER_ID, email: "stranger@example.com", full_name: "Stranger User", role: "STUDENT" },
  ];

  const collaborators = [
    { paper_id: PAPER_ID, user_id: COMMENTER_ID, role: "COMMENT" },
    { paper_id: PAPER_ID, user_id: VIEWER_ID, role: "VIEW" },
  ];

  function resetState() {
    threads = [
      {
        id: THREAD_ID,
        paper_id: PAPER_ID,
        created_by: COMMENTER_ID,
        title: "Question on Equation 3",
        anchor_type: "text_highlight",
        anchor_data: { page_number: 3, selected_text: "Softmax(QK^T / sqrt(d_k))" },
        annotation_id: null,
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    messages = [
      {
        id: MESSAGE_ID,
        thread_id: THREAD_ID,
        parent_id: null,
        user_id: COMMENTER_ID,
        content: "Could @owner@example.com explain the scaling factor here?",
        mentions: ["owner@example.com"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    notifications = [];
  }

  t.beforeEach(() => {
    resetState();
    pool.query = async (sql, params = []) => {
      const text = String(sql);

      // Sessions check
      if (text.includes("FROM sessions") || text.includes("FROM user_sessions")) {
        return { rows: [] };
      }

      // Users query
      if (text.includes("FROM users")) {
        if (text.includes("WHERE id = $1")) {
          const u = users.find((x) => x.id === params[0]);
          return { rows: u ? [u] : [] };
        }
        if (text.includes("LOWER(email) = LOWER($1)")) {
          const u = users.find((x) => x.email.toLowerCase() === params[0].toLowerCase());
          return { rows: u ? [u] : [] };
        }
        if (text.includes("LOWER(email) LIKE LOWER($1)") || text.includes("LOWER(full_name)")) {
          return { rows: [users[0]] };
        }
        return { rows: users };
      }

      // Papers query
      if (text.includes("FROM papers") && text.includes("WHERE id = $1")) {
        const p = papers.find((x) => x.id === params[0]);
        return { rows: p ? [p] : [] };
      }

      // Paper Collaborators query
      if (text.includes("FROM paper_collaborators WHERE paper_id = $1 AND user_id = $2")) {
        const c = collaborators.find((x) => x.paper_id === params[0] && x.user_id === params[1]);
        return { rows: c ? [c] : [] };
      }

      // Discussion Threads query
      if (text.includes("FROM discussion_threads t")) {
        if (text.includes("WHERE t.id = $1 AND t.paper_id = $2")) {
          const tRow = threads.find((th) => th.id === params[0] && th.paper_id === params[1]);
          if (!tRow) return { rows: [] };
          const u = users.find((usr) => usr.id === tRow.created_by) || {};
          return {
            rows: [
              {
                ...tRow,
                creator_name: u.full_name,
                creator_email: u.email,
                annotation_page: null,
                annotation_content: null,
              },
            ],
          };
        }
        // Listing
        const list = threads
          .filter((th) => th.paper_id === params[0])
          .map((th) => {
            const u = users.find((usr) => usr.id === th.created_by) || {};
            const thMsgs = messages.filter((m) => m.thread_id === th.id);
            return {
              ...th,
              creator_name: u.full_name,
              creator_email: u.email,
              message_count: thMsgs.length,
              last_message_at: th.updated_at,
              annotation_page: null,
              annotation_content: null,
            };
          });
        return { rows: list };
      }

      if (text.includes("SELECT * FROM discussion_threads WHERE id = $1")) {
        const th = threads.find((x) => x.id === params[0]);
        return { rows: th ? [th] : [] };
      }

      if (text.includes("INSERT INTO discussion_threads")) {
        const newTh = {
          id: `th-${Date.now()}`,
          paper_id: params[0],
          created_by: params[1],
          title: params[2],
          anchor_type: params[3],
          anchor_data: typeof params[4] === "string" ? JSON.parse(params[4]) : params[4],
          annotation_id: params[5],
          status: "OPEN",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        threads.push(newTh);
        return { rows: [newTh], rowCount: 1 };
      }

      if (text.includes("UPDATE discussion_threads")) {
        const thId = params[params.length - 1];
        const th = threads.find((x) => x.id === thId);
        if (th) {
          if (text.includes("status = $1")) th.status = params[0];
          th.updated_at = new Date().toISOString();
          return { rows: [th], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (text.includes("DELETE FROM discussion_threads")) {
        threads = threads.filter((x) => x.id !== params[0]);
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      // Discussion Messages queries
      if (text.includes("FROM discussion_messages m")) {
        if (text.includes("WHERE m.thread_id = $1")) {
          const list = messages
            .filter((m) => m.thread_id === params[0])
            .map((m) => {
              const u = users.find((usr) => usr.id === m.user_id) || {};
              return {
                ...m,
                user_name: u.full_name,
                user_email: u.email,
              };
            });
          return { rows: list };
        }
        if (text.includes("WHERE m.id = $1")) {
          const m = messages.find((x) => x.id === params[0]);
          return { rows: m ? [m] : [] };
        }
      }

      if (text.includes("SELECT id, user_id FROM discussion_messages WHERE id = $1")) {
        const m = messages.find((x) => x.id === params[0]);
        return { rows: m ? [m] : [] };
      }

      if (text.includes("INSERT INTO discussion_messages")) {
        const newMsg = {
          id: `msg-${Date.now()}`,
          thread_id: params[0],
          parent_id: params[1],
          user_id: params[2],
          content: params[3],
          mentions: params[4],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        messages.push(newMsg);
        return { rows: [newMsg], rowCount: 1 };
      }

      if (text.includes("DELETE FROM discussion_messages")) {
        messages = messages.filter((m) => m.id !== params[0]);
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      // Notifications queries
      if (text.includes("INSERT INTO notifications")) {
        const newNotif = {
          id: `notif-${Date.now()}`,
          user_id: params[0],
          type: params[1],
          title: params[2],
          message: params[3],
          link: params[4],
          data: params[5],
          is_read: false,
          created_at: new Date().toISOString(),
        };
        notifications.push(newNotif);
        return { rows: [newNotif], rowCount: 1 };
      }

      if (text.includes("FROM notifications")) {
        if (text.includes("COUNT(*) AS unread_count")) {
          const count = notifications.filter((n) => n.user_id === params[0] && !n.is_read).length;
          return { rows: [{ unread_count: String(count) }] };
        }
        const userNotifs = notifications.filter((n) => n.user_id === params[0]);
        return { rows: userNotifs };
      }

      if (text.includes("UPDATE notifications")) {
        if (text.includes("WHERE id = $1 AND user_id = $2")) {
          const n = notifications.find((x) => x.id === params[0] && x.user_id === params[1]);
          if (n) n.is_read = true;
          return { rows: n ? [n] : [], rowCount: n ? 1 : 0 };
        }
        if (text.includes("WHERE user_id = $1 AND is_read = FALSE")) {
          notifications.forEach((n) => {
            if (n.user_id === params[0]) n.is_read = true;
          });
          return { rows: [], rowCount: 1 };
        }
      }

      return { rows: [] };
    };
  });

  t.after(() => {
    pool.query = originalQuery;
  });

  await t.test("1. Unauthenticated request to discussions returns 401", async () => {
    const res = await request(app).get(`/api/papers/${PAPER_ID}/discussions`);
    assert.equal(res.status, 401);
  });

  await t.test("2. Non-collaborator stranger cannot access discussions (403)", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/discussions`)
      .set("Authorization", `Bearer ${tokenFor(STRANGER_ID, "stranger@example.com")}`);
    assert.equal(res.status, 403);
  });

  await t.test("3. Viewer can read discussion threads (200)", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/discussions`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.threads.length, 1);
    assert.equal(res.body.threads[0].title, "Question on Equation 3");
  });

  await t.test("4. Viewer CANNOT create a discussion thread (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/discussions`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`)
      .send({
        title: "Viewer question",
        content: "Should not be allowed",
        anchor_type: "text_highlight",
      });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /view-only access/i);
  });

  await t.test("5. Commenter CAN create a discussion thread anchored to text highlight (201)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/discussions`)
      .set("Authorization", `Bearer ${tokenFor(COMMENTER_ID, "commenter@example.com")}`)
      .send({
        title: "Attention mechanisms",
        anchor_type: "text_highlight",
        anchor_data: { page_number: 2, selected_text: "Multi-Head Attention" },
        content: "Hey @owner@example.com please check this attention mechanism.",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.thread.anchor_type, "text_highlight");
    assert.equal(res.body.thread.status, "OPEN");
    assert.equal(res.body.initial_message.mentions.length, 1);
    assert.equal(res.body.initial_message.mentions[0], "owner@example.com");
    // Verify notification was generated for mentioned owner
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].user_id, OWNER_ID);
    assert.equal(notifications[0].type, "DISCUSSION_MENTION");
  });

  await t.test("6. Creating thread with empty content is rejected (400)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/discussions`)
      .set("Authorization", `Bearer ${tokenFor(COMMENTER_ID, "commenter@example.com")}`)
      .send({
        title: "Empty message",
        content: "   ",
        anchor_type: "general",
      });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /content is required/i);
  });

  await t.test("7. Get discussion thread details and messages (200)", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.thread.id, THREAD_ID);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].id, MESSAGE_ID);
  });

  await t.test("8. Viewer CANNOT post replies to a thread (403)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}/messages`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`)
      .send({ content: "Unauthorized reply" });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /view-only access/i);
  });

  await t.test("9. Owner can post threaded reply with parent_id (201)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}/messages`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({
        content: "Sure! The scaling factor prevents gradients from vanishing.",
        parent_id: MESSAGE_ID,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.discussion_message.parent_id, MESSAGE_ID);
    // Notification sent to thread creator / parent author
    const replyNotif = notifications.find((n) => n.type === "DISCUSSION_REPLY");
    assert.ok(replyNotif);
    assert.equal(replyNotif.user_id, COMMENTER_ID);
  });

  await t.test("10. Creator can resolve thread status (200)", async () => {
    const res = await request(app)
      .patch(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}`)
      .set("Authorization", `Bearer ${tokenFor(COMMENTER_ID, "commenter@example.com")}`)
      .send({ status: "RESOLVED" });
    assert.equal(res.status, 200);
    assert.equal(res.body.thread.status, "RESOLVED");
  });

  await t.test("11. Viewer CANNOT modify thread status (403)", async () => {
    const res = await request(app)
      .patch(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`)
      .send({ status: "OPEN" });
    assert.equal(res.status, 403);
  });

  await t.test("12. Author can delete their own message (200)", async () => {
    const res = await request(app)
      .delete(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}/messages/${MESSAGE_ID}`)
      .set("Authorization", `Bearer ${tokenFor(COMMENTER_ID, "commenter@example.com")}`);
    assert.equal(res.status, 200);
    assert.match(res.body.message, /deleted/i);
  });

  await t.test("13. Stranger cannot delete author's message (403)", async () => {
    resetState();
    const res = await request(app)
      .delete(`/api/papers/${PAPER_ID}/discussions/${THREAD_ID}/messages/${MESSAGE_ID}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID, "viewer@example.com")}`);
    assert.equal(res.status, 403);
  });

  await t.test("14. Notifications API returns list and marks as read (200)", async () => {
    // Add dummy notification
    notifications.push({
      id: "notif-test",
      user_id: OWNER_ID,
      type: "DISCUSSION_MENTION",
      title: "Mention",
      message: "You were mentioned",
      link: "/papers/1",
      data: {},
      is_read: false,
      created_at: new Date().toISOString(),
    });

    const getRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`);
    assert.equal(getRes.status, 200);
    assert.ok(getRes.body.notifications.length >= 1);

    const markRes = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`);
    assert.equal(markRes.status, 200);
    assert.match(markRes.body.message, /marked as read/i);
  });
});
