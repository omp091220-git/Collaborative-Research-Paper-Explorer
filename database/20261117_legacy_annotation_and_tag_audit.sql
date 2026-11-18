-- ==============================================================================
-- Migration: 20261117_legacy_annotation_and_tag_audit.sql
-- Description: Audit views and legacy handling policy for annotations and
--              paper tag assignments.
--
-- Policy:
--   1. Legacy records with NULL ownership metadata (created_by IS NULL or
--      assigned_by IS NULL) are restricted to SYSTEM_ADMIN deletion to ensure
--      auditability and prevent arbitrary users from deleting unowned/historical data.
--   2. Preserves existing RBAC: RESEARCHER can delete their own records,
--      SYSTEM_ADMIN can delete any record, STUDENT cannot delete records.
--   3. Foreign key constraints:
--      - annotations.paper_id ON DELETE CASCADE
--      - paper_tag_assignments.paper_id ON DELETE CASCADE
--      - paper_tag_assignments.annotation_id ON DELETE CASCADE
--      - paper_tag_assignments.tag_id ON DELETE RESTRICT
-- ==============================================================================

-- 1. Create administrative audit view for legacy annotations missing creator info
CREATE OR REPLACE VIEW v_legacy_unowned_annotations AS
SELECT 
    a.id,
    a.paper_id,
    p.title AS paper_title,
    a.page_number,
    a.content,
    a.created_at,
    a.updated_at
FROM annotations a
JOIN papers p ON a.paper_id = p.id
WHERE a.created_by IS NULL;

-- 2. Create administrative audit view for legacy paper tag assignments missing assigner info
CREATE OR REPLACE VIEW v_legacy_unowned_paper_tags AS
SELECT 
    pta.id,
    pta.paper_id,
    p.title AS paper_title,
    pta.annotation_id,
    pta.tag_id,
    tt.name AS tag_name,
    pta.created_at
FROM paper_tag_assignments pta
JOIN papers p ON pta.paper_id = p.id
JOIN topic_tags tt ON pta.tag_id = tt.id
WHERE pta.assigned_by IS NULL;

-- 3. Comments for documentation and schema discovery
COMMENT ON VIEW v_legacy_unowned_annotations IS 
'Administrative view listing annotations created before strict ownership tracking or where user was purged. Only SYSTEM_ADMIN may delete these records.';

COMMENT ON VIEW v_legacy_unowned_paper_tags IS 
'Administrative view listing paper/annotation tag assignments missing assigned_by metadata. Only SYSTEM_ADMIN may delete these records.';

-- Safe rollback instructions:
-- DROP VIEW IF EXISTS v_legacy_unowned_paper_tags;
-- DROP VIEW IF EXISTS v_legacy_unowned_annotations;
