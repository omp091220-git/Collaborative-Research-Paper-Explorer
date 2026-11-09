-- ==============================================================================
-- FR-09: PDF Figures, Charts, and Tables Extraction & Asset Storage
-- Target: PostgreSQL 15+ (Neon)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABLE: paper_extraction_jobs
-- Tracks extraction lifecycle, distributed worker lease locks, and execution history.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_extraction_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id          UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts      INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    assets_count      INTEGER NOT NULL DEFAULT 0 CHECK (assets_count >= 0),
    error_message     TEXT,

    -- Distributed worker lease management and fencing
    locked_by         VARCHAR(150),
    lease_token       UUID,
    lease_expires_at  TIMESTAMPTZ,

    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Composite unique constraint required for composite foreign key from paper_assets
    CONSTRAINT uq_paper_extraction_jobs_id_paper UNIQUE (id, paper_id)
);

-- Index for worker polling by status and creation time
CREATE INDEX IF NOT EXISTS idx_paper_extraction_jobs_polling
    ON paper_extraction_jobs (status, created_at ASC)
    WHERE status IN ('pending', 'processing');

-- History & query index by paper_id
CREATE INDEX IF NOT EXISTS idx_paper_extraction_jobs_paper_id
    ON paper_extraction_jobs (paper_id, created_at DESC);

-- Lookup index for the active/latest completed job per paper
CREATE INDEX IF NOT EXISTS idx_paper_extraction_jobs_completed
    ON paper_extraction_jobs (paper_id, completed_at DESC)
    WHERE status = 'completed';

-- Guarantee: At most ONE active (pending or processing) job per paper at any given moment
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_extraction_job_per_paper
    ON paper_extraction_jobs (paper_id)
    WHERE status IN ('pending', 'processing');

-- Automatic updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_paper_extraction_jobs_updated_at'
    ) THEN
        CREATE TRIGGER trg_paper_extraction_jobs_updated_at
        BEFORE UPDATE ON paper_extraction_jobs
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- TABLE: paper_assets
-- Stores visual assets (figures, charts, tables) as images.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id            UUID NOT NULL,
    job_id              UUID NOT NULL,
    asset_type          VARCHAR(20) NOT NULL
                        CHECK (asset_type IN ('figure', 'chart', 'table')),
    page_number         INTEGER NOT NULL CHECK (page_number >= 1),
    asset_order         INTEGER NOT NULL DEFAULT 0 CHECK (asset_order >= 0),
    file_path           TEXT NOT NULL,
    file_size_bytes     BIGINT NOT NULL CHECK (file_size_bytes > 0),
    mime_type           VARCHAR(100) NOT NULL
                        CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    width               INTEGER CHECK (width IS NULL OR width > 0),
    height              INTEGER CHECK (height IS NULL OR height > 0),
    caption             TEXT,
    extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Composite foreign key enforces strict consistency: asset's paper_id MUST match job's paper_id
    CONSTRAINT fk_paper_assets_job_paper
        FOREIGN KEY (job_id, paper_id)
        REFERENCES paper_extraction_jobs(id, paper_id)
        ON DELETE CASCADE,

    -- Per-job asset position uniqueness
    CONSTRAINT uq_paper_assets_job_position
        UNIQUE (job_id, asset_type, page_number, asset_order),

    CONSTRAINT uq_paper_assets_file_path
        UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS idx_paper_assets_lookup
    ON paper_assets (paper_id, job_id, asset_type, page_number ASC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_paper_assets_updated_at'
    ) THEN
        CREATE TRIGGER trg_paper_assets_updated_at
        BEFORE UPDATE ON paper_assets
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;

