import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";

const TEST_SECRET = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const COLLAB_USER_ID = "20000000-0000-4000-8000-000000000002";
const STRANGER_ID = "30000000-0000-4000-8000-000000000003";
const PAPER_ID = "40000000-0000-4000-8000-000000000004";
const INVITATION_ID = "50000000-0000-4000-8000-000000000005";

function tokenFor(id, email, role = "RESEARCHER") {
  return jwt.sign({ id, email, role }, TEST_SECRET, { expiresIn: "10m" });
}

test("FR-18 Collaborator Management Test Suite", async (t) => {
  const originalQuery = pool.query;

  // Mock database handler state
  let collaborators = [];
  let invitations = [];
  const papers = [
    {
      id: PAPER_ID,
      title: "Attention Is All You Need",
      uploader_id: OWNER_ID,
    },
  ];
  const users = [
    { id: OWNER_ID, email: "owner@example.com", full_name: "Paper Owner", role: "RESEARCHER" },
    { id: COLLAB_USER_ID, email: "collab@example.com", full_name: "Collab User", role: "RESEARCHER" },
    { id: STRANGER_ID, email: "stranger@example.com", full_name: "Stranger User", role: "STUDENT" },
  ];

  function resetState() {
    collaborators = [
      {
        id: "c-1",
        paper_id: PAPER_ID,
        user_id: COLLAB_USER_ID,
        role: "COMMENT",
        invited_by: OWNER_ID,
        created_at: new Date().toISOString(),
      },
    ];
    invitations = [
      {
        id: INVITATION_ID,
        paper_id: PAPER_ID,
        invited_email: "stranger@example.com",
        invited_by: OWNER_ID,
        role: "VIEW",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ];
  }

  t.beforeEach(() => {
    resetState();
    pool.query = async (sql, params = []) => {
      const text = String(sql);

      // Session check query
      if (text.includes("FROM sessions") || text.includes("FROM user_sessions")) {
        return { rows: [] };
      }

      // Users table query
      if (text.includes("FROM users")) {
        if (text.includes("WHERE id = $1")) {
          const user = users.find((u) => u.id === params[0]);
          return { rows: user ? [user] : [] };
        }
        if (text.includes("LOWER(email) = LOWER($1)")) {
          const user = users.find((u) => u.email.toLowerCase() === params[0].toLowerCase());
          return { rows: user ? [user] : [] };
        }
        return { rows: users };
      }

      // Papers table query
      if (text.includes("FROM papers") && text.includes("WHERE id = $1")) {
        const paper = papers.find((p) => p.id === params[0]);
        return { rows: paper ? [paper] : [] };
      }

      // Paper Collaborators queries
      if (text.includes("FROM paper_collaborators")) {
        if (text.includes("WHERE paper_id = $1 AND user_id = $2")) {
          const c = collaborators.find((x) => x.paper_id === params[0] && x.user_id === params[1]);
          return { rows: c ? [c] : [] };
        }
        if (text.includes("WHERE c.paper_id = $1") || text.includes("WHERE paper_id = $1")) {
          const rows = collaborators
            .filter((x) => x.paper_id === params[0])
            .map((c) => {
              const u = users.find((usr) => usr.id === c.user_id) || {};
              return {
                ...c,
                email: u.email,
                full_name: u.full_name,
                global_role: u.role,
                invited_by_name: "Paper Owner",
              };
            });
          return { rows };
        }
      }

      if (text.includes("INSERT INTO paper_collaborators")) {
        const newCollab = {
          id: `c-${Date.now()}`,
          paper_id: params[0],
          user_id: params[1],
          role: params[2],
          invited_by: params[3],
        };
        const existingIdx = collaborators.findIndex(
          (c) => c.paper_id === params[0] && c.user_id === params[1]
        );
        if (existingIdx >= 0) {
          collaborators[existingIdx].role = params[2];
        } else {
          collaborators.push(newCollab);
        }
        return { rows: [newCollab], rowCount: 1 };
      }

      if (text.includes("UPDATE paper_collaborators")) {
        const [role, paperId, userId] = params;
        const c = collaborators.find((x) => x.paper_id === paperId && x.user_id === userId);
        if (c) {
          c.role = role;
          return { rows: [c], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (text.includes("DELETE FROM paper_collaborators")) {
        const [paperId, userId] = params;
        const initLen = collaborators.length;
        collaborators = collaborators.filter(
          (x) => !(x.paper_id === paperId && x.user_id === userId)
        );
        return { rows: [{ id: "deleted" }], rowCount: initLen - collaborators.length };
      }

      // Paper Invitations queries
      if (text.includes("FROM paper_invitations")) {
        if (text.includes("WHERE paper_id = $1 AND status = 'PENDING'")) {
          const invs = invitations.filter((i) => i.paper_id === params[0] && i.status === "PENDING");
          return { rows: invs };
        }
        if (text.includes("WHERE paper_id = $1 AND LOWER(invited_email) = LOWER($2)")) {
          const invs = invitations.filter(
            (i) =>
              i.paper_id === params[0] &&
              i.invited_email.toLowerCase() === params[1].toLowerCase() &&
              i.status === "PENDING"
          );
          return { rows: invs };
        }
        if (text.includes("WHERE LOWER(i.invited_email) = LOWER($1)")) {
          const invs = invitations
            .filter((i) => i.invited_email.toLowerCase() === params[0].toLowerCase() && i.status === "PENDING")
            .map((i) => ({
              ...i,
              paper_title: "Attention Is All You Need",
              inviter_name: "Paper Owner",
              inviter_email: "owner@example.com",
            }));
          return { rows: invs };
        }
        if (text.includes("WHERE i.id = $1") || text.includes("WHERE id = $1")) {
          const inv = invitations.find((i) => i.id === params[0]);
          return {
            rows: inv ? [{ ...inv, paper_title: "Attention Is All You Need" }] : [],
          };
        }
      }

      if (text.includes("INSERT INTO paper_invitations")) {
        const newInv = {
          id: `inv-${Date.now()}`,
          paper_id: params[0],
          invited_email: params[1],
          invited_by: params[2],
          role: params[3],
          status: "PENDING",
          token: params[4],
          expires_at: new Date(Date.now() + 604800000).toISOString(),
          created_at: new Date().toISOString(),
        };
        invitations.push(newInv);
        return { rows: [newInv], rowCount: 1 };
      }

      if (text.includes("UPDATE paper_invitations")) {
        const inv = invitations.find((i) => i.id === params[1] || i.id === params[0]);
        if (inv) {
          if (text.includes("'REVOKED'")) inv.status = "REVOKED";
          if (text.includes("'ACCEPTED'")) inv.status = "ACCEPTED";
          if (text.includes("'DECLINED'")) inv.status = "DECLINED";
          return { rows: [inv], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Notifications insertion
      if (text.includes("INSERT INTO notifications")) {
        return { rows: [{ id: "notif-1" }], rowCount: 1 };
      }

      return { rows: [] };
    };
  });

  t.after(() => {
    pool.query = originalQuery;
  });

  await t.test("1. Unauthenticated request to collaborators returns 401", async () => {
    const res = await request(app).get(`/api/papers/${PAPER_ID}/collaborators`);
    assert.equal(res.status, 401);
  });

  await t.test("2. Non-collaborator stranger cannot access collaborators list (403)", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/collaborators`)
      .set("Authorization", `Bearer ${tokenFor(STRANGER_ID, "stranger@example.com")}`);
    assert.equal(res.status, 403);
  });

  await t.test("3. Paper owner can view collaborators list and pending invitations (200)", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/collaborators`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.my_role, "OWNER");
    assert.equal(res.body.permissions.canManage, true);
    assert.equal(res.body.collaborators.length, 1);
    assert.equal(res.body.pending_invitations.length, 1);
  });

  await t.test("4. Collaborator with COMMENT role can view collaborators list (200) without pending invitations", async () => {
    const res = await request(app)
      .get(`/api/papers/${PAPER_ID}/collaborators`)
      .set("Authorization", `Bearer ${tokenFor(COLLAB_USER_ID, "collab@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.my_role, "COMMENT");
    assert.equal(res.body.permissions.canManage, false);
    assert.equal(res.body.pending_invitations.length, 0);
  });

  await t.test("5. Owner can invite a new collaborator with EDIT role (201)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ email: "newcollab@example.com", role: "EDIT" });
    assert.equal(res.status, 201);
    assert.equal(res.body.invitation.role, "EDIT");
    assert.equal(res.body.invitation.invited_email, "newcollab@example.com");
  });

  await t.test("6. Non-owner cannot invite collaborators (403)", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(COLLAB_USER_ID, "collab@example.com")}`)
      .send({ email: "test@example.com", role: "VIEW" });
    assert.equal(res.status, 403);
  });

  await t.test("7. Inviting self is rejected with 400", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ email: "owner@example.com", role: "VIEW" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot invite yourself/i);
  });

  await t.test("8. Inviting with invalid role is rejected with 400", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ email: "test2@example.com", role: "SUPER_ADMIN" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid role/i);
  });

  await t.test("9. Inviting an existing collaborator returns 409 Conflict", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ email: "collab@example.com", role: "VIEW" });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already a collaborator/i);
  });

  await t.test("10. Inviting an email with an active pending invitation returns 409 Conflict", async () => {
    const res = await request(app)
      .post(`/api/papers/${PAPER_ID}/collaborators/invite`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ email: "stranger@example.com", role: "VIEW" });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /pending invitation already exists/i);
  });

  await t.test("11. Owner can update collaborator permissions to EDIT (200)", async () => {
    const res = await request(app)
      .patch(`/api/papers/${PAPER_ID}/collaborators/${COLLAB_USER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`)
      .send({ role: "EDIT" });
    assert.equal(res.status, 200);
    assert.equal(res.body.collaborator.role, "EDIT");
  });

  await t.test("12. Non-owner cannot update collaborator permissions (403)", async () => {
    const res = await request(app)
      .patch(`/api/papers/${PAPER_ID}/collaborators/${COLLAB_USER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(COLLAB_USER_ID, "collab@example.com")}`)
      .send({ role: "VIEW" });
    assert.equal(res.status, 403);
  });

  await t.test("13. User can fetch their pending invitations (200)", async () => {
    const res = await request(app)
      .get("/api/invitations/my-invitations")
      .set("Authorization", `Bearer ${tokenFor(STRANGER_ID, "stranger@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.invitations.length, 1);
    assert.equal(res.body.invitations[0].paper_title, "Attention Is All You Need");
  });

  await t.test("14. User can accept their pending invitation (200)", async () => {
    const res = await request(app)
      .post(`/api/invitations/${INVITATION_ID}/accept`)
      .set("Authorization", `Bearer ${tokenFor(STRANGER_ID, "stranger@example.com")}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.role, "VIEW");
  });

  await t.test("15. Wrong user cannot accept someone else's invitation (403)", async () => {
    resetState();
    const res = await request(app)
      .post(`/api/invitations/${INVITATION_ID}/accept`)
      .set("Authorization", `Bearer ${tokenFor(COLLAB_USER_ID, "collab@example.com")}`);
    assert.equal(res.status, 403);
  });

  await t.test("16. User can decline invitation (200)", async () => {
    resetState();
    const res = await request(app)
      .post(`/api/invitations/${INVITATION_ID}/decline`)
      .set("Authorization", `Bearer ${tokenFor(STRANGER_ID, "stranger@example.com")}`);
    assert.equal(res.status, 200);
  });

  await t.test("17. Collaborator can remove themselves (leave collaboration) (200)", async () => {
    const res = await request(app)
      .delete(`/api/papers/${PAPER_ID}/collaborators/${COLLAB_USER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(COLLAB_USER_ID, "collab@example.com")}`);
    assert.equal(res.status, 200);
    assert.match(res.body.message, /left the collaboration/i);
  });

  await t.test("18. Owner can revoke a pending invitation (200)", async () => {
    resetState();
    const res = await request(app)
      .delete(`/api/papers/${PAPER_ID}/collaborators/invitations/${INVITATION_ID}`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID, "owner@example.com")}`);
    assert.equal(res.status, 200);
    assert.match(res.body.message, /revoked/i);
  });
});
