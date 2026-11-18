import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import annotationRoutes from "../routes/annotation.routes.js";
import pool from "../config/database.js";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PAPER_ID = "33333333-3333-4333-8333-333333333333";
const ANNOTATION_ID = "44444444-4444-4444-8444-444444444444";

const TEST_SECRET =
  process.env.JWT_SECRET || "test-secret-for-annotation-tests-123456";

const originalQuery = pool.query;

let activeRole = "STUDENT";
let queryHandler = async () => ({ rows: [] });

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.use("/api/annotations", annotationRoutes);

  app.use((error, req, res, next) => {
    res.status(500).json({ error: error.message });
  });

  return app;
}

function tokenFor(userId = TEST_USER_ID) {
  return jwt.sign({ id: userId }, TEST_SECRET, { expiresIn: "5m" });
}

function mockDatabase(role, handler = async () => ({ rows: [] })) {
  activeRole = role;
  queryHandler = handler;

  pool.query = async (sql, params) => {
    const text = String(sql);

    // The authorization middleware calls findUserById().
    if (
      text.includes("FROM users") &&
      text.includes("WHERE id = $1")
    ) {
      const id = params?.[0];

      if (id === TEST_USER_ID) {
        return {
          rows: [{
            id: TEST_USER_ID,
            email: "test@example.com",
            full_name: "Test User",
            role: activeRole,
          }],
        };
      }

      if (id === OTHER_USER_ID) {
        return {
          rows: [{
            id: OTHER_USER_ID,
            email: "other@example.com",
            full_name: "Other User",
            role: "RESEARCHER",
          }],
        };
      }

      return { rows: [] };
    }

    return queryHandler(text, params);
  };
}

function asUser(role, userId = TEST_USER_ID) {
  mockDatabase(role);
  return request(createTestApp())
    .get("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor(userId)}`);
}

test("Annotation API: unauthenticated request returns 401", async () => {
  const response = await request(createTestApp()).get("/api/annotations");
  assert.equal(response.status, 401);
});

test("Annotation API: student can read annotations", async () => {
  mockDatabase("STUDENT");

  const response = await request(createTestApp())
    .get("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.annotations, []);
});

test("Annotation API: researcher can read annotations", async () => {
  mockDatabase("RESEARCHER");

  const response = await request(createTestApp())
    .get("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 200);
});

test("Annotation API: system admin can read annotations", async () => {
  mockDatabase("SYSTEM_ADMIN");

  const response = await request(createTestApp())
    .get("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 200);
});

test("Annotation API: invalid paper UUID returns 400", async () => {
  mockDatabase("STUDENT");

  const response = await request(createTestApp())
    .get("/api/annotations?paper_id=invalid")
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 400);
});

test("Annotation API: student cannot create annotations", async () => {
  mockDatabase("STUDENT");

  const response = await request(createTestApp())
    .post("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({
      paper_id: PAPER_ID,
      page_number: 1,
      content: "Test annotation",
    });

  assert.equal(response.status, 403);
});

test("Annotation API: researcher can create an annotation", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("INSERT INTO annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          paper_id: PAPER_ID,
          created_by: TEST_USER_ID,
          page_number: 1,
          content: "Test annotation",
        }],
      };
    }

    return { rows: [] };
  });

  const response = await request(createTestApp())
    .post("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({
      paper_id: PAPER_ID,
      page_number: 1,
      content: "Test annotation",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.annotation.created_by, TEST_USER_ID);
});

test("Annotation API: invalid annotation content returns 400", async () => {
  mockDatabase("RESEARCHER");

  const response = await request(createTestApp())
    .post("/api/annotations")
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({
      paper_id: PAPER_ID,
      page_number: 1,
      content: "   ",
    });

  assert.equal(response.status, 400);
});

test("Annotation API: researcher cannot delete another user's annotation", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: OTHER_USER_ID,
        }],
      };
    }
    return { rows: [] };
  });

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "You can only delete your own annotations.");
});

test("Annotation API: researcher cannot delete legacy annotation without creator metadata", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: null,
        }],
      };
    }
    return { rows: [] };
  });

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 403);
  assert.match(response.body.error, /Legacy annotations without ownership metadata/);
});

test("Annotation API: researcher can delete their own annotation", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: TEST_USER_ID,
        }],
      };
    }
    if (sql.includes("DELETE FROM annotations")) {
      return { rows: [{ id: ANNOTATION_ID }] };
    }
    return { rows: [] };
  });

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.id, ANNOTATION_ID);
});

test("Annotation API: deleting nonexistent annotation returns 404", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return { rows: [] };
    }
    return { rows: [] };
  });

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 404);
});

test("Annotation API: student role is rejected from deleting annotations", async () => {
  mockDatabase("STUDENT");

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 403);
});

test("Annotation API: invalid annotation ID returns 400", async () => {
  mockDatabase("SYSTEM_ADMIN");

  const response = await request(createTestApp())
    .delete("/api/annotations/not-a-uuid")
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 400);
});

test("Annotation API: administrator can delete an existing annotation", async () => {
  mockDatabase("SYSTEM_ADMIN", async (sql) => {
    if (sql.includes("DELETE FROM annotations")) {
      return { rows: [{ id: ANNOTATION_ID }] };
    }

    return { rows: [] };
  });

  const response = await request(createTestApp())
    .delete(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.id, ANNOTATION_ID);
});

test("Annotation API: researcher cannot edit another user's annotation", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: OTHER_USER_ID,
        }],
      };
    }

    return { rows: [] };
  });

  const response = await request(createTestApp())
    .patch(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({ content: "Changed text" });

  assert.equal(response.status, 403);
});

test("Annotation API: researcher can edit their own annotation", async () => {
  mockDatabase("RESEARCHER", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: TEST_USER_ID,
        }],
      };
    }

    if (sql.includes("UPDATE annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          paper_id: PAPER_ID,
          created_by: TEST_USER_ID,
          page_number: 1,
          content: "Updated annotation",
        }],
      };
    }

    return { rows: [] };
  });

  const response = await request(createTestApp())
    .patch(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({ content: "Updated annotation" });

  assert.equal(response.status, 200);
  assert.equal(response.body.annotation.content, "Updated annotation");
});

test("Annotation API: system admin can edit another user's annotation", async () => {
  mockDatabase("SYSTEM_ADMIN", async (sql) => {
    if (sql.includes("SELECT id, created_by FROM annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          created_by: OTHER_USER_ID,
        }],
      };
    }

    if (sql.includes("UPDATE annotations")) {
      return {
        rows: [{
          id: ANNOTATION_ID,
          paper_id: PAPER_ID,
          created_by: OTHER_USER_ID,
          page_number: 1,
          content: "Admin updated annotation",
        }],
      };
    }

    return { rows: [] };
  });

  const response = await request(createTestApp())
    .patch(`/api/annotations/${ANNOTATION_ID}`)
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({ content: "Admin updated annotation" });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.annotation.content,
    "Admin updated annotation"
  );
});

// Restore the original database method after all tests in this file finish.
test.after(() => {
  pool.query = originalQuery;
});
