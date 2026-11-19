import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";

const OWNER_ID = "11111111-0000-4000-8000-000000000001";
const RESEARCHER_A_ID = "22222222-0000-4000-8000-000000000002";
const RESEARCHER_B_ID = "33333333-0000-4000-8000-000000000003";
const STUDENT_ID = "44444444-0000-4000-8000-000000000004";
const ADMIN_ID = "55555555-0000-4000-8000-000000000005";

const PUBLIC_PAPER_ID = "66666666-0000-4000-8000-000000000006";
const PRIVATE_PAPER_ID = "77777777-0000-4000-8000-000000000007";
const REQUEST_ID = "88888888-0000-4000-8000-000000000008";

function tokenFor(id, email, role = "RESEARCHER") {
  const secret = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";
  return jwt.sign({ id, email, role }, secret, { expiresIn: "10m" });
}

test("Paper Ownership, Visibility, Access Requests & Collaboration Management Suite", async (t) => {
  const originalQuery = pool.query;

  // In-memory state for mock DB queries
  let papers = [];
  let users = [];
  let collaborators = [];
  let accessRequests = [];
  let auditLogs = [];
  let notifications = [];

  function resetState() {
    users = [
      { id: OWNER_ID, email: "owner@univ.edu", full_name: "Dr. Shyam Ramani", role: "RESEARCHER", affiliation: "MIT AI Lab" },
      { id: RESEARCHER_A_ID, email: "alice@univ.edu", full_name: "Alice Walker", role: "RESEARCHER", affiliation: "Stanford" },
      { id: RESEARCHER_B_ID, email: "bob@univ.edu", full_name: "Bob Stone", role: "RESEARCHER", affiliation: "Berkeley" },
      { id: STUDENT_ID, email: "student@univ.edu", full_name: "Sam Student", role: "STUDENT", affiliation: "MIT" },
      { id: ADMIN_ID, email: "admin@scholarsphere.org", full_name: "Platform Admin", role: "SYSTEM_ADMIN", affiliation: "ScholarSphere" },
    ];

    papers = [
      {
        id: PUBLIC_PAPER_ID,
        title: "Deep Learning Applications",
        abstract: "Comprehensive survey of modern deep learning.",
        authors: ["Shyam Ramani", "Collaborator Team"],
        arxiv_id: "2301.00001",
        doi: "10.1234/dla.2026",
        publication_year: 2026,
        file_path: "uploads/public-paper.pdf",
        file_size_bytes: 1048576,
        mime_type: "application/pdf",
        uploader_id: OWNER_ID,
        visibility: "PUBLIC",
        is_archived: false,
        uploaded_at: new Date("2026-11-18T10:00:00Z").toISOString(),
        updated_at: new Date("2026-11-18T10:00:00Z").toISOString(),
      },
      {
        id: PRIVATE_PAPER_ID,
        title: "Proprietary Quantum Computing",
        abstract: "Confidential research on quantum error correction.",
        authors: ["Shyam Ramani"],
        arxiv_id: null,
        doi: null,
        publication_year: 2026,
        file_path: "uploads/private-paper.pdf",
        file_size_bytes: 2097152,
        mime_type: "application/pdf",
        uploader_id: OWNER_ID,
        visibility: "PRIVATE",
        is_archived: false,
        uploaded_at: new Date("2026-11-18T11:00:00Z").toISOString(),
        updated_at: new Date("2026-11-18T11:00:00Z").toISOString(),
      },
    ];

    collaborators = [
      {
        id: "collab-1",
        paper_id: PRIVATE_PAPER_ID,
        user_id: RESEARCHER_A_ID,
        role: "COMMENT",
        permission: "ANNOTATE",
        invited_by: OWNER_ID,
        granted_by: OWNER_ID,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    accessRequests = [];
    auditLogs = [];
    notifications = [];
  }

  // Intercept pool.query for precise unit testing of application logic
  pool.query = async function mockQuery(sql, params = []) {
    const s = (typeof sql === "string" ? sql : sql.text || "").replace(/\s+/g, " ").trim();

    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    // 1. Session check
    if (s.includes("FROM sessions") || s.includes("SELECT 1 FROM sessions")) {
      return { rows: [{ id: "sess-1" }], rowCount: 1 };
    }

    // 2. User lookup
    if (s.includes("FROM users WHERE id = $1") || s.includes("users WHERE id = $1") || s.includes("FROM users WHERE LOWER(email)")) {
      if (s.includes("LOWER(email)")) {
        const u = users.find((x) => x.email.toLowerCase() === params[0].toLowerCase());
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      const u = users.find((x) => x.id === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }

    // 3. Papers lookup by ID (resolvePaperPermission)
    if (s.includes("FROM papers p") && s.includes("JOIN users u ON u.id = p.uploader_id") && s.includes("WHERE p.id = $1")) {
      const p = papers.find((x) => x.id === params[0]);
      if (!p) return { rows: [], rowCount: 0 };
      const u = users.find((x) => x.id === p.uploader_id);
      const row = {
        ...p,
        owner_name: u?.full_name || "Unknown",
        owner_email: u?.email || "unknown@univ.edu",
        owner_affiliation: u?.affiliation || null,
        star_count: 0,
        is_starred: false,
        collaborator_count: collaborators.filter((c) => c.paper_id === p.id && c.status !== "REVOKED").length,
      };
      return { rows: [row], rowCount: 1 };
    }

    // 3b. Simple paper lookup (SELECT only)
    if (s.startsWith("SELECT") && (s.includes("FROM papers WHERE id = $1") || s.includes("FROM papers p WHERE p.id = $1"))) {
      const p = papers.find((x) => x.id === params[0]);
      return { rows: p ? [p] : [], rowCount: p ? 1 : 0 };
    }

    // 4. Collaborator lookup (SELECT only)
    if (s.startsWith("SELECT") && s.includes("FROM paper_collaborators WHERE paper_id = $1 AND user_id = $2")) {
      const c = collaborators.find((x) => x.paper_id === params[0] && x.user_id === params[1]);
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }

    if (s.includes("FROM paper_collaborators c") && s.includes("JOIN users u ON c.user_id = u.id") && s.includes("WHERE c.paper_id = $1")) {
      const active = collaborators.filter((x) => x.paper_id === params[0] && x.status !== "REVOKED");
      const rows = active.map((c) => {
        const u = users.find((x) => x.id === c.user_id);
        const inv = users.find((x) => x.id === c.invited_by);
        return {
          ...c,
          email: u?.email || "",
          full_name: u?.full_name || "",
          global_role: u?.role || "",
          affiliation: u?.affiliation || "",
          invited_by_name: inv?.full_name || "",
        };
      });
      return { rows, rowCount: rows.length };
    }

    // 5. Update paper visibility
    if (s.includes("UPDATE papers") && s.includes("SET visibility = $1")) {
      const p = papers.find((x) => x.id === params[1]);
      if (p) {
        p.visibility = params[0];
        p.updated_at = new Date().toISOString();
      }
      return { rows: p ? [p] : [], rowCount: p ? 1 : 0 };
    }

    // 6. Delete paper
    if (s.includes("DELETE FROM papers WHERE") || (s.startsWith("DELETE FROM papers") && !s.includes("paper_collaborators"))) {
      const idx = papers.findIndex((x) => x.id === params[0]);
      if (idx !== -1) {
        papers.splice(idx, 1);
      }
      return { rows: [{ id: params[0] }], rowCount: 1 };
    }

    // 7. Access requests: check pending duplicate
    if (s.includes("FROM paper_access_requests") && s.includes("status = 'PENDING'") && s.includes("requested_permission = $3")) {
      const existing = accessRequests.find(
        (r) => r.paper_id === params[0] && r.requester_id === params[1] && r.requested_permission === params[2] && r.status === "PENDING"
      );
      return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
    }

    // 8. Access requests: insert
    if (s.includes("INSERT INTO paper_access_requests")) {
      const newReq = {
        id: REQUEST_ID,
        paper_id: params[0],
        requester_id: params[1],
        owner_id: params[2],
        requested_permission: params[3],
        reason: params[4] || null,
        status: "PENDING",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        decided_at: null,
      };
      accessRequests.push(newReq);
      return { rows: [newReq], rowCount: 1 };
    }

    // 9. Access requests: find by ID (with join)
    if (s.includes("FROM paper_access_requests r") && s.includes("WHERE r.id = $1")) {
      const r = accessRequests.find((x) => x.id === params[0]);
      if (!r) return { rows: [], rowCount: 0 };
      const reqUser = users.find((u) => u.id === r.requester_id);
      const ownUser = users.find((u) => u.id === r.owner_id);
      const pap = papers.find((p) => p.id === r.paper_id);
      return {
        rows: [
          {
            ...r,
            requester_name: reqUser?.full_name || "",
            requester_email: reqUser?.email || "",
            owner_name: ownUser?.full_name || "",
            owner_email: ownUser?.email || "",
            paper_title: pap?.title || "",
            uploader_id: pap?.uploader_id || r.owner_id,
            paper_visibility: pap?.visibility || "PUBLIC",
          },
        ],
        rowCount: 1,
      };
    }

    // 10. Access requests: update status
    if (s.includes("UPDATE paper_access_requests")) {
      let r = null;
      if (s.includes("SET status = 'APPROVED'")) {
        r = accessRequests.find((x) => x.id === params[1]);
        if (r) {
          r.status = "APPROVED";
          r.decided_by = params[0];
          r.decided_at = new Date().toISOString();
          r.updated_at = new Date().toISOString();
        }
      } else if (s.includes("SET status = 'REJECTED'")) {
        r = accessRequests.find((x) => x.id === params[2]);
        if (r) {
          r.status = "REJECTED";
          r.decided_by = params[0];
          r.rejection_reason = params[1];
          r.decided_at = new Date().toISOString();
          r.updated_at = new Date().toISOString();
        }
      } else if (s.includes("SET status = 'CANCELLED'")) {
        r = accessRequests.find((x) => x.id === params[0]);
        if (r) {
          r.status = "CANCELLED";
          r.updated_at = new Date().toISOString();
        }
      } else if (s.includes("SET status = $1")) {
        r = accessRequests.find((x) => x.id === params[3]);
        if (r) {
          r.status = params[0];
          r.decided_by = params[1] || null;
          r.rejection_reason = params[2] || null;
          r.decided_at = new Date().toISOString();
          r.updated_at = new Date().toISOString();
        }
      }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }

    // 11. Collaborator insert / upsert (on approval)
    if (s.includes("INSERT INTO paper_collaborators")) {
      let c = collaborators.find((x) => x.paper_id === params[0] && x.user_id === params[1]);
      if (c) {
        c.role = params[2];
        c.permission = params[3];
        c.status = "ACTIVE";
        c.updated_at = new Date().toISOString();
      } else {
        c = {
          id: `collab-${Date.now()}`,
          paper_id: params[0],
          user_id: params[1],
          role: params[2],
          permission: params[3],
          invited_by: params[4],
          granted_by: params[4],
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        collaborators.push(c);
      }
      return { rows: [c], rowCount: 1 };
    }

    // 12. Collaborator update
    if (s.includes("UPDATE paper_collaborators") && s.includes("SET role = $1")) {
      const c = collaborators.find((x) => x.paper_id === params[2] && x.user_id === params[3]);
      if (c) {
        c.role = params[0];
        c.permission = params[1];
        c.status = "ACTIVE";
        c.updated_at = new Date().toISOString();
      }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }

    // 13. Collaborator delete
    if (s.includes("DELETE FROM paper_collaborators")) {
      const idx = collaborators.findIndex((x) => x.paper_id === params[0] && x.user_id === params[1]);
      if (idx !== -1) {
        const removed = collaborators.splice(idx, 1)[0];
        return { rows: [removed], rowCount: 1 };
      }
      return { rows: [{ id: "deleted" }], rowCount: 1 };
    }

    // 14. Notifications insert
    if (s.includes("INSERT INTO notifications")) {
      const n = {
        id: `notif-${Date.now()}`,
        recipient_id: params[0],
        actor_id: params[1],
        type: params[2],
        title: params[3],
        message: params[4],
        paper_id: params[5],
        source_type: params[6],
        source_id: params[7],
        data: typeof params[8] === "string" ? JSON.parse(params[8]) : params[8],
        link: params[9],
        is_read: false,
        created_at: new Date().toISOString(),
      };
      notifications.push(n);
      return { rows: [n], rowCount: 1 };
    }

    // 15. Audit log insert
    if (s.includes("INSERT INTO paper_audit_log")) {
      const al = {
        id: `audit-${Date.now()}`,
        paper_id: params[0],
        actor_id: params[1],
        event_type: params[2],
        event_data: typeof params[3] === "string" ? JSON.parse(params[3]) : params[3],
        created_at: new Date().toISOString(),
      };
      auditLogs.push(al);
      return { rows: [al], rowCount: 1 };
    }

    // 16. My papers query
    if (s.includes("SELECT") && s.includes("FROM papers") && s.includes("WHERE uploader_id = $1")) {
      const owned = papers.filter((x) => x.uploader_id === params[0]);
      return {
        rows: [
          {
            total_papers: owned.length,
            public_papers: owned.filter((x) => x.visibility === "PUBLIC").length,
            private_papers: owned.filter((x) => x.visibility === "PRIVATE").length,
            total_collaborators: 1,
            pending_requests: 0,
          },
        ],
        rowCount: 1,
      };
    }

    if (s.includes("FROM papers p") && s.includes("WHERE p.uploader_id = $1")) {
      const owned = papers.filter((x) => x.uploader_id === params[0]);
      const mapped = owned.map((p) => {
        const u = users.find((x) => x.id === p.uploader_id);
        return {
          ...p,
          owner_name: u?.full_name || "",
          owner_email: u?.email || "",
          owner_affiliation: u?.affiliation || "",
          collaborator_count: collaborators.filter((c) => c.paper_id === p.id).length,
          annotation_count: 0,
          tag_count: 0,
          pending_requests_count: 0,
        };
      });
      return { rows: mapped, rowCount: mapped.length };
    }

    // Fallback for counts and simple queries
    if (s.includes("SELECT COUNT(*)")) {
      return { rows: [{ count: 0, total: 0 }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };

  t.after(() => {
    pool.query = originalQuery;
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: Paper Visibility Tests
  // ---------------------------------------------------------------------------
  await t.test("1.1 Public paper is visible to all authorized platform users", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.id, PUBLIC_PAPER_ID);
    assert.equal(res.body.paper.visibility, "PUBLIC");
    assert.equal(res.body.paper.owner_name, "Dr. Shyam Ramani");
    assert.equal(res.body.paper.user_permission, "VIEW");
  });

  await t.test("1.2 Student can view public paper but cannot annotate", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.permissions.canView, true);
    assert.equal(res.body.paper.permissions.canAnnotate, false);
    assert.equal(res.body.paper.permissions.canEdit, false);
  });

  await t.test("1.3 Private paper is visible to paper owner", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.id, PRIVATE_PAPER_ID);
    assert.equal(res.body.paper.is_owner, true);
    assert.equal(res.body.paper.user_permission, "OWNER");
    assert.equal(res.body.paper.permissions.canManage, true);
  });

  await t.test("1.4 Private paper is visible to explicitly authorized collaborator", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_A_ID, "alice@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.id, PRIVATE_PAPER_ID);
    assert.equal(res.body.paper.user_permission, "ANNOTATE");
    assert.equal(res.body.paper.permissions.canAnnotate, true);
  });

  await t.test("1.5 Private paper is inaccessible to unauthorized researcher (403)", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 403);
    assert.equal(res.body.is_private, true);
  });

  await t.test("1.6 Student cannot access restricted private paper (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 403);
    assert.equal(res.body.is_private, true);
  });

  await t.test("1.7 Unauthorized researcher cannot access private paper PDF (403)", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}/pdf`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: Permission Requests Tests
  // ---------------------------------------------------------------------------
  await t.test("2.1 Researcher can submit access request on public paper for ANNOTATE", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "ANNOTATE",
        reason: "I would like to add notes on Section 4 methodologies.",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.requested_permission, "ANNOTATE");
    assert.equal(res.body.request.status, "PENDING");
    assert.equal(accessRequests.length, 1);
  });

  await t.test("2.2 Duplicate pending requests are prevented (409 Conflict)", async () => {
    resetState();
    accessRequests = [
      {
        id: "req-existing",
        paper_id: PUBLIC_PAPER_ID,
        requester_id: RESEARCHER_B_ID,
        owner_id: OWNER_ID,
        requested_permission: "ANNOTATE",
        status: "PENDING",
      },
    ];

    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "ANNOTATE",
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already have an active pending request/i);
  });

  await t.test("2.3 Owner cannot request access to their own paper (400)", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "ANNOTATE",
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /owner of this paper/i);
  });

  await t.test("2.4 Student cannot request ANNOTATE or EDIT permissions (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "ANNOTATE",
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /read-only access/i);
  });

  await t.test("2.5 Requester can cancel their own pending request", async () => {
    resetState();
    accessRequests = [
      {
        id: REQUEST_ID,
        paper_id: PUBLIC_PAPER_ID,
        requester_id: RESEARCHER_B_ID,
        owner_id: OWNER_ID,
        requested_permission: "ANNOTATE",
        status: "PENDING",
      },
    ];

    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .post(`/api/access-requests/${REQUEST_ID}/cancel`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(accessRequests[0].status, "CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: Collaborators & Access Approval / Rejection
  // ---------------------------------------------------------------------------
  await t.test("3.1 Unauthorized user cannot approve access request (403)", async () => {
    resetState();
    accessRequests = [
      {
        id: REQUEST_ID,
        paper_id: PUBLIC_PAPER_ID,
        requester_id: RESEARCHER_B_ID,
        owner_id: OWNER_ID,
        requested_permission: "ANNOTATE",
        status: "PENDING",
      },
    ];

    const token = tokenFor(RESEARCHER_A_ID, "alice@univ.edu", "RESEARCHER");

    // Mock client for transaction
    pool.connect = async () => ({
      query: pool.query,
      release: () => {},
    });

    const res = await request(app)
      .post(`/api/access-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 403);
  });

  await t.test("3.2 Owner can approve request and grant permission", async () => {
    resetState();
    accessRequests = [
      {
        id: REQUEST_ID,
        paper_id: PUBLIC_PAPER_ID,
        requester_id: RESEARCHER_B_ID,
        owner_id: OWNER_ID,
        requested_permission: "ANNOTATE",
        status: "PENDING",
      },
    ];

    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    pool.connect = async () => ({
      query: pool.query,
      release: () => {},
    });

    const res = await request(app)
      .post(`/api/access-requests/${REQUEST_ID}/approve`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(accessRequests[0].status, "APPROVED");
    // Verify collaborator was created/upserted
    const granted = collaborators.find((c) => c.user_id === RESEARCHER_B_ID);
    assert.ok(granted);
    assert.equal(granted.permission, "ANNOTATE");
  });

  await t.test("3.3 Owner can reject request with reason", async () => {
    resetState();
    accessRequests = [
      {
        id: REQUEST_ID,
        paper_id: PUBLIC_PAPER_ID,
        requester_id: RESEARCHER_B_ID,
        owner_id: OWNER_ID,
        requested_permission: "EDIT",
        status: "PENDING",
      },
    ];

    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    pool.connect = async () => ({
      query: pool.query,
      release: () => {},
    });

    const res = await request(app)
      .post(`/api/access-requests/${REQUEST_ID}/reject`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({
        rejection_reason: "Editing permissions are restricted to core lab researchers.",
      });

    assert.equal(res.status, 200);
    assert.equal(accessRequests[0].status, "REJECTED");
    assert.equal(accessRequests[0].rejection_reason, "Editing permissions are restricted to core lab researchers.");
  });

  await t.test("3.4 Owner can upgrade collaborator permission", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .patch(`/api/papers/${PRIVATE_PAPER_ID}/collaborators/${RESEARCHER_A_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({ role: "EDIT" });

    assert.equal(res.status, 200);
    assert.equal(res.body.collaborator.permission, "EDIT");
  });

  await t.test("3.5 Revoking collaborator access removes collaborator immediately", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .delete(`/api/papers/${PRIVATE_PAPER_ID}/collaborators/${RESEARCHER_A_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    const exists = collaborators.find((c) => c.user_id === RESEARCHER_A_ID && c.status !== "REVOKED");
    assert.equal(exists, undefined);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: My Papers Dashboard Tests
  // ---------------------------------------------------------------------------
  await t.test("4.1 User sees only papers they own on /api/papers/my", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .get("/api/papers/my")
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(res.body.papers.length, 2);
    assert.equal(res.body.stats.total_papers, 2);
    assert.equal(res.body.stats.public_papers, 1);
    assert.equal(res.body.stats.private_papers, 1);
  });

  await t.test("4.2 Owner can toggle visibility from PUBLIC to PRIVATE", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .patch(`/api/papers/${PUBLIC_PAPER_ID}/visibility`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({ visibility: "PRIVATE" });

    assert.equal(res.status, 200);
    assert.equal(res.body.visibility, "PRIVATE");
    assert.equal(papers[0].visibility, "PRIVATE");
  });

  await t.test("4.3 Unauthorized user cannot change paper visibility (403)", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .patch(`/api/papers/${PUBLIC_PAPER_ID}/visibility`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({ visibility: "PRIVATE" });

    assert.equal(res.status, 403);
  });

  await t.test("4.4 Platform admin can change paper visibility", async () => {
    resetState();
    const token = tokenFor(ADMIN_ID, "admin@scholarsphere.org", "SYSTEM_ADMIN");

    const res = await request(app)
      .patch(`/api/papers/${PUBLIC_PAPER_ID}/visibility`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`])
      .send({ visibility: "PRIVATE" });

    assert.equal(res.status, 200);
    assert.equal(res.body.visibility, "PRIVATE");
  });

  await t.test("4.5 Owner can delete their paper", async () => {
    resetState();
    const token = tokenFor(OWNER_ID, "owner@univ.edu", "RESEARCHER");

    const res = await request(app)
      .delete(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 200);
    assert.equal(papers.length, 1);
  });

  await t.test("4.6 Unauthorized user cannot delete another user's paper (403)", async () => {
    resetState();
    const token = tokenFor(RESEARCHER_B_ID, "bob@univ.edu", "RESEARCHER");

    const res = await request(app)
      .delete(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Authorization", `Bearer ${token}`).set("Cookie", [`token=${token}`]);

    assert.equal(res.status, 403);
  });
});
