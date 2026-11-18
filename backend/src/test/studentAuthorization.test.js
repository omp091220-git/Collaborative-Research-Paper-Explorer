import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";
import { ROLES, PERMISSIONS, hasPermission, getPermissionsForRole } from "../utils/roles.js";

const OWNER_ID = "11111111-0000-4000-8000-000000000001";
const RESEARCHER_ID = "22222222-0000-4000-8000-000000000002";
const STUDENT_ID = "44444444-0000-4000-8000-000000000004";
const ADMIN_ID = "55555555-0000-4000-8000-000000000005";

const PUBLIC_PAPER_ID = "66666666-0000-4000-8000-000000000006";
const PRIVATE_PAPER_ID = "77777777-0000-4000-8000-000000000007";
const PERMITTED_PRIVATE_PAPER_ID = "99999999-0000-4000-8000-000000000009";

function tokenFor(id, email, role = "STUDENT") {
  const secret = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";
  return jwt.sign({ id, email, role }, secret, { expiresIn: "10m" });
}

test("Student Role Authorization & Read-Only Security Suite", async (t) => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  pool.connect = async () => ({
    query: pool.query,
    release: () => {},
  });

  let papers = [];
  let users = [];
  let collaborators = [];
  let accessRequests = [];
  let annotations = [];

  function resetState() {
    users = [
      { id: OWNER_ID, email: "owner@univ.edu", full_name: "Dr. Owner", role: "RESEARCHER" },
      { id: RESEARCHER_ID, email: "researcher@univ.edu", full_name: "Dr. Researcher", role: "RESEARCHER" },
      { id: STUDENT_ID, email: "student@univ.edu", full_name: "Sam Student", role: "STUDENT" },
      { id: ADMIN_ID, email: "admin@scholarsphere.org", full_name: "Admin", role: "SYSTEM_ADMIN" },
    ];

    papers = [
      {
        id: PUBLIC_PAPER_ID,
        title: "Public Machine Learning Paper",
        abstract: "Public open access survey.",
        authors: ["Dr. Owner"],
        arxiv_id: "2301.12345",
        uploader_id: OWNER_ID,
        visibility: "PUBLIC",
        is_archived: false,
        file_path: "uploads/public.pdf",
        uploaded_at: new Date().toISOString(),
      },
      {
        id: PRIVATE_PAPER_ID,
        title: "Restricted Private Lab Report",
        abstract: "Confidential ongoing experiments.",
        authors: ["Dr. Owner"],
        arxiv_id: null,
        uploader_id: OWNER_ID,
        visibility: "PRIVATE",
        is_archived: false,
        file_path: "uploads/private.pdf",
        uploaded_at: new Date().toISOString(),
      },
      {
        id: PERMITTED_PRIVATE_PAPER_ID,
        title: "Permitted Private Paper For Student Reading",
        abstract: "Student was granted VIEW collaborator access.",
        authors: ["Dr. Owner"],
        arxiv_id: null,
        uploader_id: OWNER_ID,
        visibility: "PRIVATE",
        is_archived: false,
        file_path: "uploads/permitted.pdf",
        uploaded_at: new Date().toISOString(),
      },
    ];

    collaborators = [
      {
        id: "collab-student-view",
        paper_id: PERMITTED_PRIVATE_PAPER_ID,
        user_id: STUDENT_ID,
        role: "VIEW",
        permission: "VIEW",
        status: "ACTIVE",
      },
    ];

    accessRequests = [];
    annotations = [
      {
        id: "annot-1111-0000-0000-0000-000000000001",
        paper_id: PUBLIC_PAPER_ID,
        created_by: OWNER_ID,
        page_number: 1,
        content: "Seminal insight on deep representations.",
      },
    ];
  }

  // Intercept DB queries with mock
  pool.query = async (text, params) => {
    const s = (typeof text === "string" ? text : text?.text || "").replace(/\s+/g, " ").trim();

    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    // 1. Auth lookups
    if (s.includes("FROM users WHERE id = $1") || s.includes("users WHERE id = $1") || s.includes("FROM users u WHERE u.id = $1")) {
      const u = users.find((x) => x.id === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }

    // 2. Paper lookups
    if (s.includes("FROM papers WHERE id = $1") || s.includes("FROM papers p") && s.includes("WHERE p.id = $1")) {
      const p = papers.find((x) => x.id === params[0]);
      if (!p) return { rows: [], rowCount: 0 };
      const owner = users.find((x) => x.id === p.uploader_id) || {};
      const collabCount = collaborators.filter((c) => c.paper_id === p.id && c.status !== "REVOKED").length;
      return {
        rows: [{
          ...p,
          owner_name: owner.full_name,
          owner_email: owner.email,
          collaborator_count: collabCount,
          star_count: 0,
          is_starred: false,
        }],
        rowCount: 1,
      };
    }

    // 3. Collaborators query
    if (s.includes("FROM paper_collaborators") && s.includes("paper_id = $1") && s.includes("user_id = $2")) {
      const c = collaborators.find((x) => x.paper_id === params[0] && x.user_id === params[1] && x.status !== "REVOKED");
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }

    // 4. Access request check
    if (s.includes("FROM paper_access_requests") && s.includes("paper_id = $1") && s.includes("requester_id = $2")) {
      const r = accessRequests.find((x) => x.paper_id === params[0] && x.requester_id === params[1] && x.status === "PENDING");
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }

    // 5. Insert access request
    if (s.includes("INSERT INTO paper_access_requests")) {
      const newReq = {
        id: "req-" + Math.random().toString(36).slice(2),
        paper_id: params[0],
        requester_id: params[1],
        owner_id: params[2],
        requested_permission: params[3],
        reason: params[4] || null,
        status: "PENDING",
        created_at: new Date().toISOString(),
      };
      accessRequests.push(newReq);
      return { rows: [newReq], rowCount: 1 };
    }

    // 5b. Access request by ID lookup (for approve/reject)
    if (s.includes("FROM paper_access_requests r") && s.includes("WHERE r.id = $1")) {
      return {
        rows: [{
          id: params[0],
          paper_id: PUBLIC_PAPER_ID,
          requester_id: STUDENT_ID,
          owner_id: OWNER_ID,
          requested_permission: "VIEW",
          status: "PENDING",
          paper_title: "Public Machine Learning Paper",
          uploader_id: OWNER_ID,
        }],
        rowCount: 1,
      };
    }

    // 6. Annotations queries
    if (s.includes("FROM annotations") && s.includes("paper_id = $1")) {
      const annots = annotations.filter((a) => a.paper_id === params[0]);
      return { rows: annots, rowCount: annots.length };
    }

    if (s.includes("FROM annotations WHERE id = $1")) {
      const annot = annotations.find((a) => a.id === params[0]);
      return { rows: annot ? [annot] : [], rowCount: annot ? 1 : 0 };
    }

    // 7. General fallback
    return { rows: [], rowCount: 0 };
  };

  t.after(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  });

  await t.test("1. Student role permissions matrix verification", async () => {
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.PAPERS_READ), true, "Student has papers:read");
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.COLLECTIONS_CREATE), true, "Student has collections:create");
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.PAPERS_UPLOAD), false, "Student does not have papers:upload");
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.PAPERS_DELETE), false, "Student does not have papers:delete");
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.COLLECTIONS_MANAGE), false, "Student does not have collections:manage");
    assert.equal(hasPermission(ROLES.STUDENT, PERMISSIONS.ADMIN_ACCESS), false, "Student does not have admin:access");
  });

  await t.test("2. Student can view public research paper", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.title, "Public Machine Learning Paper");
    assert.equal(res.body.paper.user_permission, "VIEW");
    assert.equal(res.body.paper.permissions.canAnnotate, false, "Student canAnnotate must be false on public paper");
    assert.equal(res.body.paper.permissions.canEdit, false, "Student canEdit must be false");
  });

  await t.test("3. Student cannot access unauthorized private paper (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.is_private, true);
  });

  await t.test("4. Student cannot access unauthorized private paper PDF (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PRIVATE_PAPER_ID}/pdf`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 403);
  });

  await t.test("5. Student with permitted VIEW collaborator status can read private paper", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/papers/${PERMITTED_PRIVATE_PAPER_ID}`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.paper.user_permission, "VIEW");
    assert.equal(res.body.paper.permissions.canView, true);
    assert.equal(res.body.paper.permissions.canAnnotate, false, "Permitted student remains read-only");
  });

  await t.test("6. Student cannot change paper visibility (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .patch(`/api/papers/${PUBLIC_PAPER_ID}/visibility`)
      .set("Cookie", `token=${token}`)
      .send({ visibility: "PRIVATE" });

    assert.equal(res.status, 403, "Student must receive 403 when attempting to change paper visibility");
  });

  await t.test("7. Student cannot delete a paper (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .delete(`/api/papers/${PUBLIC_PAPER_ID}`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 403, "Student must receive 403 when attempting to delete a paper");
  });

  await t.test("8. Student cannot create annotations (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/annotations")
      .set("Cookie", `token=${token}`)
      .send({
        paper_id: PUBLIC_PAPER_ID,
        page_number: 1,
        content: "Student unauthorized note.",
      });

    assert.equal(res.status, 403, "Student must receive 403 when attempting to create an annotation");
  });

  await t.test("9. Student can read annotations on public paper", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .get(`/api/annotations?paper_id=${PUBLIC_PAPER_ID}`)
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.annotations.length, 1);
  });

  await t.test("10. Student cannot edit an annotation (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .patch("/api/annotations/annot-1111-0000-0000-0000-000000000001")
      .set("Cookie", `token=${token}`)
      .send({ content: "Malicious edit attempt." });

    assert.equal(res.status, 403, "Student must receive 403 when attempting to edit an annotation");
  });

  await t.test("11. Student cannot delete an annotation (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .delete("/api/annotations/annot-1111-0000-0000-0000-000000000001")
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 403, "Student must receive 403 when attempting to delete an annotation");
  });

  await t.test("12. Student cannot assign tags to paper (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/paper-tags")
      .set("Cookie", `token=${token}`)
      .send({
        paper_id: PUBLIC_PAPER_ID,
        tag_id: "tag-123",
      });

    assert.equal(res.status, 403, "Student must receive 403 when attempting to assign a tag");
  });

  await t.test("13. Student cannot request ANNOTATE permission (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Cookie", `token=${token}`)
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "ANNOTATE",
      });

    assert.equal(res.status, 403, "Student cannot request ANNOTATE permission");
    assert.match(res.body.error, /Student accounts have read-only access/i);
  });

  await t.test("14. Student cannot request EDIT permission (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Cookie", `token=${token}`)
      .send({
        paper_id: PUBLIC_PAPER_ID,
        requested_permission: "EDIT",
      });

    assert.equal(res.status, 403, "Student cannot request EDIT permission");
  });

  await t.test("15. Student CAN request VIEW permission on private paper (201)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/access-requests")
      .set("Cookie", `token=${token}`)
      .send({
        paper_id: PRIVATE_PAPER_ID,
        requested_permission: "VIEW",
        reason: "Requesting access for thesis literature review.",
      });

    assert.equal(res.status, 201, "Student should be able to request VIEW access to private paper");
    assert.equal(res.body.request.requested_permission, "VIEW");
    assert.equal(res.body.request.status, "PENDING");
  });

  await t.test("16. Student cannot approve access requests (403)", async () => {
    resetState();
    const token = tokenFor(STUDENT_ID, "student@univ.edu", "STUDENT");

    const res = await request(app)
      .post("/api/access-requests/88888888-0000-4000-8000-000000000008/approve")
      .set("Cookie", `token=${token}`);

    assert.equal(res.status, 403, "Student cannot approve access requests");
  });
});
