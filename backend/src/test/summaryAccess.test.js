import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPaper } from "../services/summary/summaryAccess.service.js";
import { ROLES } from "../utils/roles.js";

const PAPER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OWNER_ID = "11111111-2222-4333-8444-555555555555";
const COLLABORATOR_ID = "22222222-3333-4444-8555-666666666666";
const OTHER_ID = "33333333-4444-4555-8666-777777777777";

function fakeDb(row) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      return { rows: row ? [row] : [] };
    },
  };
}

test("paper owner can access FR-08 summary and source excerpts", async () => {
  const db = fakeDb({ uploader_id: OWNER_ID, is_collection_collaborator: false });
  assert.equal(await canAccessPaper({ db, paperId: PAPER_ID, user: { id: OWNER_ID, role: ROLES.STUDENT } }), true);
  assert.equal(db.calls.length, 1);
});

test("an authorized collection member can access FR-08 summary", async () => {
  const db = fakeDb({ uploader_id: OWNER_ID, is_collection_collaborator: true });
  assert.equal(await canAccessPaper({ db, paperId: PAPER_ID, user: { id: COLLABORATOR_ID, role: ROLES.RESEARCHER } }), true);
});

test("unrelated users cannot access FR-08 summary content", async () => {
  const db = fakeDb({ uploader_id: OWNER_ID, is_collection_collaborator: false });
  assert.equal(await canAccessPaper({ db, paperId: PAPER_ID, user: { id: OTHER_ID, role: ROLES.STUDENT } }), false);
});

test("unknown papers are denied, but system admins can access papers for support", async () => {
  const db = fakeDb(null);
  assert.equal(await canAccessPaper({ db, paperId: PAPER_ID, user: { id: OTHER_ID, role: ROLES.STUDENT } }), false);
  assert.equal(await canAccessPaper({ db, paperId: PAPER_ID, user: { id: OTHER_ID, role: ROLES.SYSTEM_ADMIN } }), true);
  assert.equal(db.calls.length, 1, "admin bypass should not query paper membership");
});
