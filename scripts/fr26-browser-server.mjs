// Local test harness only; the production app has no fixture or token endpoints.
import { createRequire } from "node:module";
import {
  prepareFr26Fixture,
  ids as fr26Ids,
} from "../backend/src/testSupport/fr26Fixture.js";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const express = require("express"),
  jwt = require("jsonwebtoken");
const { prepareFr30Fixture } = process.env.FR30_TEST
  ? await import("../backend/src/testSupport/fr30Fixture.js")
  : {};
const fixture = await (prepareFr30Fixture || prepareFr26Fixture)();
const ids = fixture.ids || fr26Ids;
process.env.DATABASE_URL = fixture.connectionString;
process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  "fr26-local-browser-only-secret-at-least-32-characters";
process.env.FRONTEND_URL = "http://127.0.0.1:5176";
const { default: app } = await import("../backend/src/app.js");
const { default: pool } = await import("../backend/src/config/database.js");
const harness = express();
const tokens = {
  author: jwt.sign(
    { id: ids.author, role: "RESEARCHER" },
    process.env.JWT_SECRET,
  ),
  reader: jwt.sign({ id: ids.reader, role: "STUDENT" }, process.env.JWT_SECRET),
  admin: jwt.sign(
    { id: ids.admin, role: "SYSTEM_ADMIN" },
    process.env.JWT_SECRET,
  ),
};
for (const kind of ["writer", "outsider"])
  if (ids[kind])
    tokens[kind] = jwt.sign(
      { id: ids[kind], role: "RESEARCHER" },
      process.env.JWT_SECRET,
    );
const initial = (await fixture.db.query("SELECT * FROM posts")).rows;
const initialPermissions = (
  await fixture.db.query("SELECT * FROM post_permissions")
).rows;
async function reset() {
  await fixture.db.query("DELETE FROM post_permissions");
  for (const p of initialPermissions)
    await fixture.db.query(
      "INSERT INTO post_permissions(post_id,user_id,permission_level,granted_by) VALUES($1,$2,$3,$4)",
      [p.post_id, p.user_id, p.permission_level, p.granted_by],
    );
  await fixture.db.query(
    "UPDATE users SET account_type=CASE WHEN id=$1 THEN 'PRIVATE'::user_account_type ELSE 'PUBLIC'::user_account_type END",
    [ids.privateAuthor],
  );
  await fixture.db.query("DELETE FROM posts WHERE NOT (id=ANY($1::uuid[]))", [
    initial.map((p) => p.id),
  ]);
  for (const p of initial)
    await fixture.db.query(
      "UPDATE posts SET visibility=$2,created_at=$3,title=$4,content=$5,tags=$6 WHERE id=$1",
      [p.id, p.visibility, p.created_at, p.title, p.content, p.tags],
    );
}
harness.get("/__fr26/fixture", (req, res) =>
  res.json({ ids, posts: fixture.posts, tokens }),
);
harness.post("/__fr26/reset", async (req, res, next) => {
  try {
    await reset();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
harness.use(app);
const server = harness.listen(5056, "127.0.0.1", () =>
  console.log("FR-26 isolated browser API ready on 5056"),
);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  try {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await fixture.cleanup();
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
