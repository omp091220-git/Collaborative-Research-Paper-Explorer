-- ==============================================================================
-- FR-11: Paper Tag Assignments
-- Assign hierarchical topic tags (FR-10) to papers or specific annotations.
--
-- Design rationale:
--   Since the project does not yet store extracted PDF text sections, this
--   table supports tagging at two granularities:
--     1. Paper-level:      paper_id required, annotation_id NULL
--     2. Annotation-level: paper_id required, annotation_id points to a
--                          specific positional annotation on the paper.
--
-- Foreign key deletion behaviour:
--   - paper_id:      ON DELETE CASCADE  — when a paper is deleted, its tag
--                    assignments are automatically removed.
--   - annotation_id: ON DELETE CASCADE  — when an annotation is deleted its
--                    tag assignment is also removed (annotation is the
--                    "container"; the assignment has no value without it).
--   - tag_id:        ON DELETE RESTRICT — prevents accidental deletion of a
--                    tag that is still in active use on papers.
--   - assigned_by:   ON DELETE SET NULL — preserves assignment history when
--                    a user account is removed.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS paper_tag_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Paper the tag is assigned to (always required)
    paper_id      UUID NOT NULL
        REFERENCES papers(id) ON DELETE CASCADE,

    -- Optional: specific annotation within the paper being tagged
    annotation_id UUID
        REFERENCES annotations(id) ON DELETE CASCADE,

    -- The hierarchical topic tag being assigned (FR-10)
    tag_id        UUID NOT NULL
        REFERENCES topic_tags(id) ON DELETE RESTRICT,

    -- User who created the assignment (audit trail)
    assigned_by   UUID
        REFERENCES users(id) ON DELETE SET NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate assignments of the same tag to the same
    -- paper+annotation combination.
    CONSTRAINT uq_paper_annotation_tag UNIQUE (paper_id, annotation_id, tag_id)
);

-- Enforce uniqueness when annotation_id is NULL (paper-level assignment)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pta_paper_null_annotation
    ON paper_tag_assignments (paper_id, tag_id)
    WHERE annotation_id IS NULL;

-- Fast lookup: all tag assignments for a given paper
CREATE INDEX IF NOT EXISTS idx_pta_paper_id
    ON paper_tag_assignments (paper_id);

-- Fast lookup: all tag assignments for a given annotation
CREATE INDEX IF NOT EXISTS idx_pta_annotation_id
    ON paper_tag_assignments (annotation_id);

-- Fast lookup: all papers/annotations assigned a particular tag
CREATE INDEX IF NOT EXISTS idx_pta_tag_id
    ON paper_tag_assignments (tag_id);

-- Audit: assignments created by a given user
CREATE INDEX IF NOT EXISTS idx_pta_assigned_by
    ON paper_tag_assignments (assigned_by);
