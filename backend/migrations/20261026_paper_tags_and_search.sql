-- ==============================================================================
-- FR-12 & FR-13: Topic Tag Intelligence, Deduplication Cache & Paper Tag Search
-- Target: PostgreSQL 15+
-- ==============================================================================

-- 1. Paper Tags Junction Table
-- Links papers with hierarchical topic tags, supporting optional section coordinates (DR-07 / FR-11)
CREATE TABLE IF NOT EXISTS paper_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES topic_tags(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    confidence_score NUMERIC(4,3) DEFAULT 1.000 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    section_name VARCHAR(100) DEFAULT 'General',
    page_number INT,
    bounding_box JSONB, -- Coordinates: {"x": number, "y": number, "w": number, "h": number}
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_paper_tag_assignment UNIQUE (paper_id, tag_id, section_name, page_number)
);

CREATE INDEX IF NOT EXISTS idx_paper_tags_paper_id ON paper_tags (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_tags_tag_id ON paper_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_paper_tags_section ON paper_tags (section_name);

-- 2. Tag Deduplication & Semantic Equivalence Cache (NFR-10: Avoid duplicate GenAI API calls)
CREATE TABLE IF NOT EXISTS tag_deduplication_cache (
    query_hash VARCHAR(64) PRIMARY KEY,
    query_text VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES topic_tags(id) ON DELETE SET NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tag_deduplication_cache_created_at ON tag_deduplication_cache (created_at);

-- 3. Tag Aliases / Consolidated Synonyms (FR-12: Tag Consolidation)
CREATE TABLE IF NOT EXISTS tag_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alias_name VARCHAR(100) NOT NULL,
    alias_slug VARCHAR(100) NOT NULL UNIQUE,
    canonical_tag_id UUID NOT NULL REFERENCES topic_tags(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tag_aliases_canonical_tag_id ON tag_aliases (canonical_tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_aliases_alias_slug ON tag_aliases (alias_slug);

-- 4. Full-Text Search Index on Papers (For sub-300ms multi-tag + keyword queries, NFR-04)
CREATE INDEX IF NOT EXISTS idx_papers_fts ON papers USING gin(to_tsvector('english', title || ' ' || COALESCE(abstract, '')));
