-- ==============================================================================
-- FR-14: Section-Level Hierarchical Topic Tags & Text Embeddings
-- Target: Neon PostgreSQL / PostgreSQL 15+
--
-- Supports:
-- 1. paper_sections: storing structured sections of papers with vector embeddings.
-- 2. paper_section_tags: associating specific section spans with topic_tags.
-- 3. Enables hybrid AI recommendations via hierarchical tags and text embeddings.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABLE: paper_sections
--
-- Stores decomposed sections of papers (e.g. Abstract, Introduction,
-- Methodology, Results, Discussion) along with vector embeddings for semantic
-- similarity search.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_sections (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id      UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section_title VARCHAR(255) NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 0,
    content       TEXT NOT NULL,
    page_number   INTEGER CHECK (page_number IS NULL OR page_number >= 1),
    -- Stores normalized vector embedding as a JSON array of floats (e.g. [0.12, -0.04, ...])
    embedding     JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_paper_sections_title_nonempty CHECK (TRIM(section_title) <> ''),
    CONSTRAINT chk_paper_sections_content_nonempty CHECK (TRIM(content) <> '')
);

-- Index to fetch all sections for a paper in order
CREATE INDEX IF NOT EXISTS idx_paper_sections_paper_id_order
    ON paper_sections (paper_id, section_order ASC);

-- Automatic updated_at trigger for paper_sections
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_paper_sections_updated_at'
    ) THEN
        CREATE TRIGGER trg_paper_sections_updated_at
        BEFORE UPDATE ON paper_sections
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- TABLE: paper_section_tags
--
-- FR-11 & FR-14: Junction table binding hierarchical topic_tags to specific
-- paper sections with confidence scores.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_section_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id  UUID NOT NULL REFERENCES paper_sections(id) ON DELETE CASCADE,
    paper_id    UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES topic_tags(id) ON DELETE CASCADE,
    confidence  NUMERIC(4, 3) NOT NULL DEFAULT 1.000
                CHECK (confidence >= 0.000 AND confidence <= 1.000),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Prevent attaching the exact same tag to the same section more than once
    CONSTRAINT uq_section_tag UNIQUE (section_id, tag_id)
);

-- Fast lookup for tags by section
CREATE INDEX IF NOT EXISTS idx_paper_section_tags_section_id
    ON paper_section_tags (section_id);

-- Fast lookup of all tags assigned to a paper
CREATE INDEX IF NOT EXISTS idx_paper_section_tags_paper_id
    ON paper_section_tags (paper_id);

-- Reverse lookup: all papers/sections tagged with a specific topic tag
CREATE INDEX IF NOT EXISTS idx_paper_section_tags_tag_id
    ON paper_section_tags (tag_id);
