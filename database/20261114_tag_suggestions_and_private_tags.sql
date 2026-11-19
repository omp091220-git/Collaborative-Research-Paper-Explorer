-- ==============================================================================
-- FR-23 & FR-24: AI Tag Suggestions, Deduplication & Private/Global Visibility
-- Target: PostgreSQL 15+
--
-- 1. Extends topic_tags to support Private vs. Global tags, approval statuses,
--    and parent-child privacy invariants.
-- 2. Indexes paper_tag_assignments by (paper_id, assigned_by) for viewer scoping.
-- 3. Creates paper_tag_suggestions for AI-proposed new tags and review workflow.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend topic_tags
-- ------------------------------------------------------------------------------

ALTER TABLE topic_tags
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_topic_tags_status'
    ) THEN
        ALTER TABLE topic_tags
        ADD CONSTRAINT chk_topic_tags_status
        CHECK (status IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED'));
    END IF;
END $$;

-- Drop legacy non-scoped unique indexes if present
DROP INDEX IF EXISTS uq_topic_tags_root_slug;
DROP INDEX IF EXISTS uq_topic_tags_sibling_slug;

-- Global root tags must be unique among global root tags
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_global_root_slug
    ON topic_tags (slug)
    WHERE parent_id IS NULL AND is_private = FALSE;

-- Global sibling tags under the same parent must have unique slugs
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_global_sibling_slug
    ON topic_tags (parent_id, slug)
    WHERE parent_id IS NOT NULL AND is_private = FALSE;

-- Private root tags are unique per creator
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_private_root_slug
    ON topic_tags (created_by, slug)
    WHERE parent_id IS NULL AND is_private = TRUE;

-- Private sibling tags under the same parent are unique per creator
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_private_sibling_slug
    ON topic_tags (created_by, parent_id, slug)
    WHERE parent_id IS NOT NULL AND is_private = TRUE;

-- Indexes for visibility and approval status lookups
CREATE INDEX IF NOT EXISTS idx_topic_tags_visibility
    ON topic_tags (is_private, status);

CREATE INDEX IF NOT EXISTS idx_topic_tags_pending_approval
    ON topic_tags (status)
    WHERE status = 'PENDING_APPROVAL';

-- Invariant Enforcement:
-- Global tags can NEVER have private parents.
-- Private tags can nest under global parents or own private parents.
CREATE OR REPLACE FUNCTION fn_check_topic_tag_hierarchy_privacy()
RETURNS TRIGGER AS $$
DECLARE
    parent_is_private BOOLEAN;
    parent_creator UUID;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT is_private, created_by INTO parent_is_private, parent_creator
        FROM topic_tags
        WHERE id = NEW.parent_id;

        IF parent_is_private IS TRUE THEN
            -- Invariant 1: Global tag cannot have a private parent
            IF NEW.is_private IS FALSE THEN
                RAISE EXCEPTION 'A global topic tag cannot have a private parent tag.';
            END IF;

            -- Invariant 2: Private tag under private parent must belong to the same creator
            IF NEW.created_by IS DISTINCT FROM parent_creator THEN
                RAISE EXCEPTION 'A private topic tag cannot be nested under another user''s private parent tag.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_topic_tag_hierarchy_privacy'
    ) THEN
        CREATE TRIGGER trg_check_topic_tag_hierarchy_privacy
        BEFORE INSERT OR UPDATE ON topic_tags
        FOR EACH ROW EXECUTE FUNCTION fn_check_topic_tag_hierarchy_privacy();
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Extend paper_tag_assignments indexing for viewer scoping
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pta_paper_assigned_by
    ON paper_tag_assignments (paper_id, assigned_by);

-- ------------------------------------------------------------------------------
-- 3. Table: paper_tag_suggestions
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS paper_tag_suggestions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id               UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    suggested_name         VARCHAR(100) NOT NULL,
    suggested_slug         VARCHAR(100) NOT NULL,
    suggested_parent_id    UUID REFERENCES topic_tags(id) ON DELETE SET NULL,
    is_new_tag             BOOLEAN NOT NULL DEFAULT TRUE,
    visibility_preference  VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    confidence             NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    reasoning              TEXT,
    duplicate_check_status VARCHAR(50) NOT NULL DEFAULT 'CLEAN',
    matched_tag_id         UUID REFERENCES topic_tags(id) ON DELETE SET NULL,
    similarity_score       NUMERIC(4,3),
    status                 VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_pts_visibility CHECK (visibility_preference IN ('PRIVATE', 'GLOBAL')),
    CONSTRAINT chk_pts_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT chk_pts_duplicate_status CHECK (duplicate_check_status IN ('CLEAN', 'POTENTIAL_DUPLICATE', 'EXACT_MATCH'))
);

CREATE INDEX IF NOT EXISTS idx_pts_paper_id ON paper_tag_suggestions(paper_id);
CREATE INDEX IF NOT EXISTS idx_pts_status ON paper_tag_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_pts_suggested_slug ON paper_tag_suggestions(suggested_slug);
CREATE INDEX IF NOT EXISTS idx_pts_matched_tag_id ON paper_tag_suggestions(matched_tag_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pts_updated_at'
    ) THEN
        CREATE TRIGGER trg_pts_updated_at
        BEFORE UPDATE ON paper_tag_suggestions
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;
