-- ==============================================================================
-- FR-39: External Publication Discovery & Researcher Profile Bibliography
-- Target: PostgreSQL 15+ (Neon / Local)
--
-- Stores external publications retrieved from academic repositories (arXiv, CrossRef, etc.)
-- linked to registered researchers, allowing complete publication history beyond
-- only locally uploaded PDFs.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS external_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    authors TEXT[] NOT NULL,
    publication_year INT,
    source VARCHAR(50) NOT NULL, -- 'arxiv', 'crossref', 'platform', etc.
    external_id VARCHAR(150),    -- e.g. arXiv identifier, CrossRef DOI, or platform paper UUID
    doi VARCHAR(150),
    venue TEXT,
    abstract TEXT,
    source_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_user_external_pub UNIQUE (user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_pub_user_id ON external_publications (user_id);
CREATE INDEX IF NOT EXISTS idx_external_pub_source ON external_publications (source);
CREATE INDEX IF NOT EXISTS idx_external_pub_year ON external_publications (publication_year);
CREATE INDEX IF NOT EXISTS idx_external_pub_doi ON external_publications (doi) WHERE doi IS NOT NULL;
