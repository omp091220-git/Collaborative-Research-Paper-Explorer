-- FR41: researcher-owned authorship review and publication discovery coverage.
CREATE TABLE IF NOT EXISTS researcher_publication_reviews (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL,
    publication_id TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('confirmed', 'rejected')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, source, publication_id)
);

CREATE TABLE IF NOT EXISTS researcher_publication_discovery_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    arxiv_status VARCHAR(20) NOT NULL CHECK (arxiv_status IN ('available', 'unavailable', 'limited')),
    crossref_status VARCHAR(20) NOT NULL CHECK (crossref_status IN ('available', 'unavailable', 'limited')),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publication_discovery_runs_latest
    ON researcher_publication_discovery_runs (user_id, checked_at DESC);
