-- =============================================================
-- FR-09: Paper Assets and Extraction Jobs
-- Creates tables for storing extracted assets (figures, charts, tables)
-- and managing extraction job lifecycle.
-- =============================================================

-- Extraction Jobs Table
CREATE TABLE IF NOT EXISTS paper_extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    assets_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    locked_by TEXT,
    lease_token TEXT,
    lease_expires_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ensure only one active (pending or processing) job per paper
    CONSTRAINT uq_one_active_extraction_job_per_paper UNIQUE (paper_id) WHERE (status IN ('pending','processing'))
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_paper_id ON paper_extraction_jobs(paper_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON paper_extraction_jobs(status);

-- Assets Table
CREATE TABLE IF NOT EXISTS paper_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES paper_extraction_jobs(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('figure','chart','table')),
    page_number INT NOT NULL,
    asset_order INT NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    file_size_bytes INT NOT NULL,
    mime_type TEXT NOT NULL,
    width INT,
    height INT,
    caption TEXT,
    extraction_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for asset queries
CREATE INDEX IF NOT EXISTS idx_assets_paper_id ON paper_assets(paper_id);
CREATE INDEX IF NOT EXISTS idx_assets_job_id ON paper_assets(job_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON paper_assets(asset_type);
