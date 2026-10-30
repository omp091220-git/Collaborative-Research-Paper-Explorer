-- FR-08: persist structured summary sections, source coordinates, reusable cache entries,
-- and durable status records for asynchronous Redis/BullMQ jobs.
-- Safe to apply to existing installations: only additive changes are made.

ALTER TABLE paper_summaries
  ADD COLUMN IF NOT EXISTS structured_sections JSONB,
  ADD COLUMN IF NOT EXISTS source_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_page_count INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_paper_summaries_source_sha256'
  ) THEN
    ALTER TABLE paper_summaries ADD CONSTRAINT chk_paper_summaries_source_sha256
      CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_paper_summaries_page_count'
  ) THEN
    ALTER TABLE paper_summaries ADD CONSTRAINT chk_paper_summaries_page_count
      CHECK (source_page_count IS NULL OR source_page_count > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS paper_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_sha256 CHAR(64) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  schema_version INTEGER NOT NULL,
  summary_type summary_type NOT NULL DEFAULT 'comprehensive',
  structured_sections JSONB NOT NULL,
  summary_text TEXT NOT NULL,
  key_findings TEXT[],
  source_page_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_paper_summary_cache UNIQUE (source_sha256, model_name, schema_version, summary_type),
  CONSTRAINT chk_paper_summary_cache_hash CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_paper_summary_cache_model CHECK (TRIM(model_name) <> ''),
  CONSTRAINT chk_paper_summary_cache_text CHECK (TRIM(summary_text) <> ''),
  CONSTRAINT chk_paper_summary_cache_sections CHECK (jsonb_typeof(structured_sections) = 'array'),
  CONSTRAINT chk_paper_summary_cache_pages CHECK (source_page_count > 0)
);

-- A cache entry may be shared only while at least one paper still references it.
-- ON DELETE CASCADE removes a paper's association; the trigger below deletes an
-- orphaned cache entry to avoid retaining private excerpts after paper deletion.
CREATE TABLE IF NOT EXISTS paper_summary_cache_papers (
  cache_id UUID NOT NULL REFERENCES paper_summary_cache(id) ON DELETE CASCADE,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cache_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_summary_cache_papers_paper
  ON paper_summary_cache_papers (paper_id);

CREATE OR REPLACE FUNCTION cleanup_orphaned_paper_summary_cache_after_paper_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Delete this paper's cache associations first. A cache shared by another paper
  -- remains; summaries and excerpts with no remaining source paper are purged.
  DELETE FROM paper_summary_cache_papers WHERE paper_id = OLD.id;
  DELETE FROM paper_summary_cache c
   WHERE NOT EXISTS (
     SELECT 1 FROM paper_summary_cache_papers link WHERE link.cache_id = c.id
   );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_orphaned_paper_summary_cache ON papers;
CREATE TRIGGER trg_cleanup_orphaned_paper_summary_cache
AFTER DELETE ON papers
FOR EACH ROW EXECUTE FUNCTION cleanup_orphaned_paper_summary_cache_after_paper_delete();

CREATE TABLE IF NOT EXISTS paper_summary_jobs (
  id UUID PRIMARY KEY,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  source_sha256 CHAR(64) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  summary_type summary_type NOT NULL DEFAULT 'comprehensive',
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  summary_id UUID REFERENCES paper_summaries(id) ON DELETE SET NULL,
  attempts_made INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_paper_summary_jobs_status CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT chk_paper_summary_jobs_attempts CHECK (attempts_made >= 0),
  CONSTRAINT chk_paper_summary_jobs_hash CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_paper_summary_jobs_model CHECK (TRIM(model_name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_paper_summary_jobs_paper_created
  ON paper_summary_jobs (paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_summary_jobs_status_created
  ON paper_summary_jobs (status, created_at ASC) WHERE status = 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_paper_summary_job
  ON paper_summary_jobs (paper_id, source_sha256, model_name, summary_type)
  WHERE status IN ('queued', 'processing');
