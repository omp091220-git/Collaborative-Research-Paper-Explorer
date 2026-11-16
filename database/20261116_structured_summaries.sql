-- FR-08: additive, durable summary jobs and content-addressed cache.
CREATE TABLE IF NOT EXISTS structured_summary_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 summary_type summary_type NOT NULL DEFAULT 'comprehensive',
 model_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
 attempts INT NOT NULL DEFAULT 0,
 available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_token UUID,
 lease_until TIMESTAMPTZ,
 sections JSONB,
 error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(paper_id, summary_type, model_name)
);
CREATE INDEX IF NOT EXISTS idx_summary_jobs_pending ON structured_summary_jobs(status, available_at);
CREATE TABLE IF NOT EXISTS structured_summary_cache (
 content_hash TEXT NOT NULL,
 summary_type summary_type NOT NULL,
 model_name TEXT NOT NULL,
 sections JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(content_hash, summary_type, model_name)
);
-- ROLLBACK (comments only, archive generated data first):
-- DROP TABLE IF EXISTS structured_summary_cache;
-- DROP TABLE IF EXISTS structured_summary_jobs;
