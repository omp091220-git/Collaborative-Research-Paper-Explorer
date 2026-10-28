-- ==============================================================================
-- FR-10: Hierarchical Topic-Tag Database
-- Target: Neon PostgreSQL (PostgreSQL 15+)
--
-- Supports nested parent-child relationships and canonical hierarchical paths:
-- e.g., energy -> energy::green_energy -> energy::green_energy::solar_panels
-- ==============================================================================

CREATE TABLE IF NOT EXISTS topic_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    parent_id   UUID REFERENCES topic_tags(id) ON DELETE RESTRICT,
    description TEXT,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Name must not be blank or whitespace-only
    CONSTRAINT chk_topic_tags_name_nonempty CHECK (
        TRIM(name) <> ''
    ),
    -- Slug must be lowercase alphanumeric with single underscore separators
    CONSTRAINT chk_topic_tags_slug_format CHECK (
        slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    ),
    -- Tag cannot be its own immediate parent
    CONSTRAINT chk_topic_tags_no_self_parent CHECK (
        id <> parent_id
    )
);

-- Root tags (parent_id IS NULL) must have unique slugs across all root tags
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_root_slug
    ON topic_tags (slug)
    WHERE parent_id IS NULL;

-- Sibling tags under the same parent must have unique slugs
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_tags_sibling_slug
    ON topic_tags (parent_id, slug)
    WHERE parent_id IS NOT NULL;

-- Index for parent-child relationship lookups and tree traversal
CREATE INDEX IF NOT EXISTS idx_topic_tags_parent_id
    ON topic_tags (parent_id);

-- Index for name search
CREATE INDEX IF NOT EXISTS idx_topic_tags_name
    ON topic_tags (name);

-- Index for created_by reference
CREATE INDEX IF NOT EXISTS idx_topic_tags_created_by
    ON topic_tags (created_by);

-- Automatic updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_topic_tags_updated_at'
    ) THEN
        CREATE TRIGGER trg_topic_tags_updated_at
        BEFORE UPDATE ON topic_tags
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;
