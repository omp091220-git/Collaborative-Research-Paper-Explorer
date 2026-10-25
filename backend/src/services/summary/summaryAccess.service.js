import { normalizeRole, ROLES } from "../../utils/roles.js";

/**
 * FR-08 must not disclose summary prose or extracted source excerpts for a paper
 * to an unrelated user. Match the repository's ownership plus collection
 * membership data model. A system administrator can assist with any paper.
 *
 * Returns false for unknown papers as well as papers the requester cannot see;
 * callers should use a 404 response to avoid disclosing paper existence.
 */
export async function canAccessPaper({ db, paperId, user }) {
  if (!user?.id || !paperId) return false;
  if (normalizeRole(user.role) === ROLES.SYSTEM_ADMIN) return true;

  const result = await db.query(
    `SELECT p.uploader_id,
            EXISTS (
              SELECT 1
                FROM collection_papers cp
                JOIN collection_members cm ON cm.collection_id = cp.collection_id
               WHERE cp.paper_id = p.id AND cm.user_id = $2
            ) AS is_collection_collaborator
       FROM papers p
      WHERE p.id = $1`,
    [paperId, user.id]
  );
  const paper = result.rows[0];
  if (!paper) return false;

  return String(paper.uploader_id) === String(user.id) || paper.is_collection_collaborator === true;
}
