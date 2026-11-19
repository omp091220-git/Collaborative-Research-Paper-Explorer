import fs from "node:fs/promises";
import { prepareFr26Fixture, ids as baseIds } from "./fr26Fixture.js";
export const ids = {
  ...baseIds,
  writer: "a9999999-9999-4999-8999-999999999999",
  outsider: "b9999999-9999-4999-8999-999999999999",
};
export async function prepareFr30Fixture(url = process.env.TEST_DATABASE_URL) {
  const fixture = await prepareFr26Fixture(url);
  try {
    for (const file of [
      "20261025_discussions_and_collaborators.sql",
      "20261118_paper_ownership_visibility_access.sql",
    ])
      await fixture.db.query(
        await fs.readFile(
          new URL("../../../database/" + file, import.meta.url),
          "utf8",
        ),
      );
    await fixture.db.query(
      "UPDATE papers SET visibility='PRIVATE' WHERE id=$1",
      [ids.paper],
    );
    for (const [id, name] of [
      [ids.writer, "Collaborating Writer"],
      [ids.outsider, "Uninvited Scholar"],
    ])
      await fixture.db.query(
        "INSERT INTO users(id,email,password_hash,full_name,account_type,role) VALUES($1,$2,'test-only',$3,'PUBLIC','RESEARCHER')",
        [id, id + "@example.edu", name],
      );
    await fixture.db.query(
      "INSERT INTO post_permissions(post_id,user_id,permission_level,granted_by) VALUES($1,$2,'WRITE',$3)",
      [ids.privatePost, ids.writer, ids.author],
    );
    return { ...fixture, ids };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
