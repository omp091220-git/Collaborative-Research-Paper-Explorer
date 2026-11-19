import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";
import { resolvePaperPermission } from "../middleware/paperAccess.js";
import { invalidateSessionSync } from "../services/session.service.js";
import { prepareFr30Fixture, ids } from "../testSupport/fr30Fixture.js";
import { createPrivatePostService } from "../services/privatePost.service.js";
import { createPrivatePostRepository } from "../repositories/privatePost.repository.js";

const missing = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("FR-30 real database and API permission boundaries", async (t) => {
  const fixture = await prepareFr30Fixture();
  const originalQuery = pool.query,
    originalConnect = pool.connect;
  pool.query = (...args) => fixture.db.query(...args);
  pool.connect = (...args) => fixture.db.connect(...args);
  const tokens = Object.fromEntries(
    Object.entries(ids)
      .filter(([kind]) =>
        [
          "author",
          "reader",
          "writer",
          "outsider",
          "admin",
          "privateAuthor",
        ].includes(kind),
      )
      .map(([kind, id]) => [
        kind,
        jwt.sign(
          {
            id,
            role:
              kind === "admin"
                ? "SYSTEM_ADMIN"
                : kind === "reader"
                  ? "STUDENT"
                  : "RESEARCHER",
          },
          process.env.JWT_SECRET,
        ),
      ]),
  );
  const api = (method, path, kind, body) => {
    const call = request(app)[method]("/api/posts" + path);
    if (kind) call.set("Authorization", "Bearer " + (tokens[kind] || kind));
    if (body !== undefined) call.send(body);
    return call;
  };
  const path = "/workspace/" + ids.privatePost,
    permissions = "/" + ids.privatePost + "/permissions";
  const grant = (email, level = "READ", kind = "author") =>
    api("put", permissions, kind, { email, permission_level: level });
  const email = (kind) => ids[kind] + "@example.edu";
  try {
    await t.test(
      "anonymous, malformed and expired tokens cannot read, edit or manage private posts",
      async () => {
        for (const token of [
          null,
          "invalid",
          jwt.sign({ id: ids.author }, process.env.JWT_SECRET, {
            expiresIn: -1,
          }),
        ])
          for (const [method, url, body] of [
            ["get", path],
            ["patch", path, { content: "No access" }],
            ["get", permissions],
            [
              "put",
              permissions,
              { email: email("outsider"), permission_level: "WRITE" },
            ],
            ["delete", permissions + "/" + ids.reader],
          ])
            assert.equal((await api(method, url, token, body)).status, 401);
      },
    );
    await t.test(
      "owner, reader, writer and current administrator get correct capabilities without account secrets",
      async () => {
        for (const [kind, access, edit, manage] of [
          ["author", "OWNER", true, true],
          ["reader", "READ", false, false],
          ["writer", "WRITE", true, false],
          ["admin", "ADMIN", true, true],
        ]) {
          const result = await api("get", path, kind);
          assert.equal(result.status, 200);
          assert.equal(result.body.post.access, access);
          assert.equal(result.body.post.can_edit, edit);
          assert.equal(result.body.post.can_manage, manage);
          assert.equal(result.headers["cache-control"], "no-store");
          for (const field of [
            "email",
            "author_email",
            "password_hash",
            "granted_by",
          ])
            assert.ok(!JSON.stringify(result.body).includes(field));
        }
      },
    );
    await t.test(
      "uninvited users and guessed IDs receive no private title, content or permission roster",
      async () => {
        for (const suffix of [path, "/workspace/" + missing]) {
          const response = await api("get", suffix, "outsider");
          assert.equal(response.status, 404);
          assert.ok(!JSON.stringify(response.body).includes("PRIVATE_CANARY"));
        }
        assert.equal((await api("get", permissions, "outsider")).status, 404);
        for (const id of ["not-a-uuid", "x' OR 1=1--"])
          assert.equal(
            (await api("get", "/workspace/" + encodeURIComponent(id), "author"))
              .status,
            400,
          );
      },
    );
    await t.test(
      "permission rosters and grants cannot be read or modified by READ or WRITE collaborators",
      async () => {
        for (const kind of ["reader", "writer"]) {
          assert.equal((await api("get", permissions, kind)).status, 403);
          assert.equal(
            (await grant(email("outsider"), "WRITE", kind)).status,
            403,
          );
          assert.equal(
            (await api("delete", permissions + "/" + ids.author, kind)).status,
            403,
          );
        }
      },
    );
    await t.test(
      "read-only users cannot edit through either endpoint, delete, change ownership or grant themselves write",
      async () => {
        for (const prefix of ["/workspace/", "/"])
          assert.equal(
            (
              await api("patch", prefix + ids.privatePost, "reader", {
                content: "Attempted reader overwrite",
              })
            ).status,
            403,
          );
        assert.equal(
          (await api("delete", "/" + ids.privatePost, "reader")).status,
          403,
        );
        assert.equal(
          (await grant(email("reader"), "WRITE", "reader")).status,
          403,
        );
      },
    );
    await t.test(
      "WRITE users edit title, body and tags through both existing and new API endpoints",
      async () => {
        for (const prefix of ["/workspace/", "/"]) {
          const result = await api(
            "patch",
            prefix + ids.privatePost,
            "writer",
            {
              title: "Collaborative private research",
              content: "<script>literal content only</script>",
              tags: ["Research"],
            },
          );
          assert.equal(result.status, 200);
          assert.equal(
            result.body.post.content,
            "<script>literal content only</script>",
          );
        }
        const saved = (
          await fixture.db.query("SELECT * FROM posts WHERE id=$1", [
            ids.privatePost,
          ])
        ).rows[0];
        assert.deepEqual(saved.tags, ["research"]);
        assert.equal(saved.visibility, "PRIVATE");
        assert.equal(saved.author_id, ids.author);
      },
    );
    await t.test(
      "WRITE users cannot publish, reassign papers/ownership, inject permissions, delete or change any restricted field",
      async () => {
        for (const body of [
          { visibility: "PUBLIC" },
          { visibility: "PRIVATE" },
          { paperId: ids.paper },
          { paper_id: ids.paper },
          { author_id: ids.writer },
          { permission_level: "WRITE" },
          { like_count: 500 },
        ])
          assert.equal((await api("patch", path, "writer", body)).status, 400);
        assert.equal(
          (await api("delete", "/" + ids.privatePost, "writer")).status,
          403,
        );
      },
    );
    await t.test(
      "owner grants registered users access; repeated grants update one row and normalized email works",
      async () => {
        assert.equal(
          (await grant(" " + email("outsider").toUpperCase() + " ")).status,
          200,
        );
        assert.equal(
          (await api("get", path, "outsider")).body.post.access,
          "READ",
        );
        assert.equal((await grant(email("outsider"), "WRITE")).status, 200);
        assert.equal((await grant(email("outsider"), "WRITE")).status, 200);
        assert.equal(
          (
            await fixture.db.query(
              "SELECT COUNT(*)::int AS n FROM post_permissions WHERE post_id=$1 AND user_id=$2",
              [ids.privatePost, ids.outsider],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "downgrading WRITE to READ takes effect on the next direct API edit",
      async () => {
        await grant(email("outsider"), "READ");
        assert.equal(
          (
            await api("patch", path, "outsider", {
              content: "Forbidden after downgrade",
            })
          ).status,
          403,
        );
        assert.equal((await api("get", path, "outsider")).status, 200);
      },
    );
    await t.test(
      "revoke is idempotent and immediately removes new and legacy read/write access and shared listing",
      async () => {
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await api("delete", permissions + "/" + ids.outsider, "author"))
              .status,
            200,
          );
        assert.equal((await api("get", path, "outsider")).status, 404);
        assert.equal(
          (await api("get", "/" + ids.privatePost, "outsider")).status,
          403,
        );
        assert.equal(
          (
            await api("patch", "/" + ids.privatePost, "outsider", {
              content: "Cannot write after removal",
            })
          ).status,
          404,
        );
        assert.equal(
          (await api("get", "/workspace", "outsider")).body.total,
          0,
        );
      },
    );
    await t.test(
      "invalid permission levels, missing/unregistered emails, owners, arrays and extra grant fields are rejected without mutation",
      async () => {
        const count = Number(
          (await fixture.db.query("SELECT COUNT(*) FROM post_permissions"))
            .rows[0].count,
        );
        for (const body of [
          { email: email("outsider"), permission_level: "ADMIN" },
          { email: "invalid", permission_level: "READ" },
          { email: email("outsider") },
          {
            email: email("outsider"),
            permission_level: "READ",
            granted_by: ids.admin,
          },
          [],
          { email: email("author"), permission_level: "WRITE" },
        ])
          assert.equal(
            (await api("put", permissions, "author", body)).status,
            400,
          );
        assert.equal((await grant("unregistered@example.edu")).status, 404);
        assert.equal(
          (await api("delete", permissions + "/" + ids.author, "author"))
            .status,
          400,
        );
        assert.equal(
          (await api("delete", permissions + "/bad", "author")).status,
          400,
        );
        assert.equal(
          Number(
            (await fixture.db.query("SELECT COUNT(*) FROM post_permissions"))
              .rows[0].count,
          ),
          count,
        );
      },
    );
    await t.test(
      "invalid edits leave saved content unchanged; oversized tags, empty and unsupported payloads fail",
      async () => {
        const initial = (await api("get", path, "author")).body.post.content;
        for (const body of [
          {},
          { title: "a" },
          { content: "x".repeat(25001) },
          { tags: Array(11).fill("tag") },
          { tags: [null] },
          { tags: ["x".repeat(51)] },
          [],
          { __protoField: "x" },
          { content: null },
        ])
          assert.equal((await api("patch", path, "writer", body)).status, 400);
        assert.equal(
          (await api("get", path, "author")).body.post.content,
          initial,
        );
      },
    );
    await t.test(
      "My/shared listing is paginated, includes only owned or explicitly shared posts and rejects injected filters",
      async () => {
        for (const kind of ["reader", "writer"]) {
          const result = await api("get", "/workspace?limit=1&offset=0", kind);
          assert.equal(result.status, 200);
          assert.equal(result.body.total, 1);
          assert.equal(result.body.posts[0].id, ids.privatePost);
          assert.equal(
            (await api("get", "/workspace?offset=100", kind)).body.posts.length,
            0,
          );
        }
        for (const query of [
          "limit=0",
          "limit=101",
          "offset=-1",
          "offset=NaN",
          "limit=1&limit=2",
          "userId=" + ids.author,
        ])
          assert.equal(
            (await api("get", "/workspace?" + query, "reader")).status,
            400,
          );
      },
    );
    await t.test(
      "public discovery stays private-free even for collaborators; public post permission management is refused",
      async () => {
        for (const kind of ["author", "reader", "writer", "admin"]) {
          const result = await api("get", "/?limit=100", kind);
          assert.equal(result.status, 200);
          assert.ok(!result.body.posts.some((p) => p.id === ids.privatePost));
          assert.equal(
            (await api("get", "/public/" + ids.privatePost, kind)).status,
            404,
          );
        }
        assert.equal(
          (
            await api(
              "put",
              "/" + fixture.posts[0] + "/permissions",
              "author",
              { email: email("writer"), permission_level: "WRITE" },
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "private accounts cannot be made public; permission grants do not grant access to a linked paper",
      async () => {
        const legacy = "/workspace/" + ids.legacyPost;
        assert.equal(
          (
            await api("patch", legacy, "privateAuthor", {
              visibility: "PUBLIC",
            })
          ).status,
          403,
        );
        const before = await fixture.db.query(
          "SELECT * FROM papers WHERE id=$1",
          [ids.paper],
        );
        await grant(email("writer"), "WRITE");
        assert.deepEqual(
          (
            await fixture.db.query("SELECT * FROM papers WHERE id=$1", [
              ids.paper,
            ])
          ).rows,
          before.rows,
        );
        const collabs = await fixture.db.query(
          "SELECT * FROM paper_collaborators WHERE user_id=$1",
          [ids.writer],
        );
        assert.equal(collabs.rowCount, 0);
        assert.equal(
          (
            await resolvePaperPermission(ids.paper, {
              id: ids.writer,
              role: "RESEARCHER",
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "revoked sessions cannot use protected or optional-auth private reads",
      async () => {
        const revoked = jwt.sign(
          { id: ids.reader, role: "STUDENT", jti: "revoked-fr30" },
          process.env.JWT_SECRET,
        );
        invalidateSessionSync(revoked);
        assert.equal((await api("get", path, revoked)).status, 401);
        assert.equal(
          (await api("get", "/" + ids.privatePost, revoked)).status,
          401,
        );
      },
    );
    await t.test(
      "stale admin tokens cannot grant access after the database role is downgraded",
      async () => {
        await fixture.db.query("UPDATE users SET role='STUDENT' WHERE id=$1", [
          ids.admin,
        ]);
        assert.equal((await api("get", path, "admin")).status, 404);
        assert.equal(
          (await grant(email("outsider"), "WRITE", "admin")).status,
          404,
        );
        assert.equal(
          (await api("delete", "/" + ids.privatePost, "admin")).status,
          403,
        );
        await fixture.db.query(
          "UPDATE users SET role='SYSTEM_ADMIN' WHERE id=$1",
          [ids.admin],
        );
      },
    );
    await t.test(
      "revocation serializes with a queued edit and the stale writer cannot commit",
      async () => {
        await grant(email("writer"), "WRITE");
        const lock = await fixture.db.connect();
        await lock.query("BEGIN");
        await lock.query("SELECT id FROM posts WHERE id=$1 FOR UPDATE", [
          ids.privatePost,
        ]);
        await lock.query(
          "DELETE FROM post_permissions WHERE post_id=$1 AND user_id=$2",
          [ids.privatePost, ids.writer],
        );
        const writerClient = await fixture.db.connect();
        const svc = createPrivatePostService(
          createPrivatePostRepository({ connect: async () => writerClient }),
        );
        const edit = svc.edit(ids.privatePost, ids.writer, {
          content: "Must never be written",
        });
        const rejected = assert.rejects(edit, { statusCode: 404 });
        let waiting = false;
        try {
          for (let i = 0; i < 100; i++) {
            const row = (
              await fixture.db.query(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
                [writerClient.processID],
              )
            ).rows[0];
            if (row?.wait_event_type === "Lock") {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.equal(
            waiting,
            true,
            "writer must actually wait on the revocation lock",
          );
        } finally {
          await lock.query("COMMIT");
          lock.release();
        }
        await rejected;
        assert.notEqual(
          (await api("get", path, "author")).body.post.content,
          "Must never be written",
        );
      },
    );
    await t.test(
      "administrator can moderate while only owner/admin controls grants; deleting cascades grants",
      async () => {
        assert.equal(
          (await grant(email("outsider"), "READ", "admin")).status,
          200,
        );
        assert.equal(
          (await api("patch", path, "admin", { content: "Moderation edit" }))
            .status,
          200,
        );
        assert.equal(
          (await api("delete", "/" + ids.privatePost, "author")).status,
          200,
        );
        assert.equal(
          (
            await fixture.db.query(
              "SELECT * FROM post_permissions WHERE post_id=$1",
              [ids.privatePost],
            )
          ).rowCount,
          0,
        );
        assert.equal((await api("get", path, "reader")).status, 404);
      },
    );
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await fixture.cleanup();
  }
});
