-- ==============================================================================
-- FR-OWN: Paper Ownership, Visibility, Access Requests & Audit Log
-- Target: PostgreSQL 15+ (Neon)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add visibility column to papers
-- Default PUBLIC for backward compatibility with existing papers.
-- ------------------------------------------------------------------------------
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'PRIVATE'));

ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast visibility filtering
CREATE INDEX IF NOT EXISTS idx_papers_visibility ON papers (visibility);
CREATE INDEX IF NOT EXISTS idx_papers_uploader_id ON papers (uploader_id);
CREATE INDEX IF NOT EXISTS idx_papers_is_archived ON papers (is_archived) WHERE is_archived = TRUE;

-- ------------------------------------------------------------------------------
-- 2. Extend paper_collaborators to support granular permissions
-- Existing role column uses: VIEW, COMMENT, EDIT
-- We add ANNOTATE as an alias for COMMENT (rename existing check constraint)
-- We also add granted_by and status columns.
-- ------------------------------------------------------------------------------

-- Add granted_by (alias for invited_by) if not already there
ALTER TABLE paper_collaborators
  ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add permission column (mirrors role, allows ANNOTATE)
ALTER TABLE paper_collaborators
  ADD COLUMN IF NOT EXISTS permission VARCHAR(20);

-- Backfill permission from role for existing rows
UPDATE paper_collaborators SET permission = role WHERE permission IS NULL;

-- Add status column (ACTIVE, REVOKED)
ALTER TABLE paper_collaborators
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED'));

-- Add index for fast permission lookup
CREATE INDEX IF NOT EXISTS idx_paper_collaborators_status ON paper_collaborators (paper_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_collaborators_permission ON paper_collaborators (paper_id, permission);

-- Backfill granted_by from invited_by
UPDATE paper_collaborators SET granted_by = invited_by WHERE granted_by IS NULL AND invited_by IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. Access Requests Table
-- Tracks granular permission requests (VIEW / ANNOTATE / EDIT) on papers.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_access_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id            UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  requester_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_permission VARCHAR(20) NOT NULL CHECK (requested_permission IN ('VIEW', 'ANNOTATE', 'EDIT')),
  reason              TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED')),
  rejection_reason    TEXT,
  decided_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at          TIMESTAMPTZ,

  -- Prevent requester from requesting their own paper
  CONSTRAINT chk_access_request_not_self CHECK (requester_id <> owner_id)
);

-- One active pending request per user+paper+permission combination
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_request_pending
  ON paper_access_requests (paper_id, requester_id, requested_permission)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_access_requests_paper_id ON paper_access_requests (paper_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester_id ON paper_access_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_owner_id ON paper_access_requests (owner_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON paper_access_requests (status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created ON paper_access_requests (created_at DESC);

-- Auto-update updated_at (use DO block for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_access_requests_updated_at'
  ) THEN
    CREATE TRIGGER trg_access_requests_updated_at
    BEFORE UPDATE ON paper_access_requests
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Paper Audit / Activity Log
-- Records important events for papers (ownership, visibility, access, etc).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id    UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type  VARCHAR(50) NOT NULL,
  event_data  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_paper_id ON paper_audit_log (paper_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON paper_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON paper_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON paper_audit_log (created_at DESC);

-- Audit all existing papers as UPLOADED (best-effort, idempotent)
INSERT INTO paper_audit_log (paper_id, actor_id, event_type, event_data, created_at)
SELECT p.id, p.uploader_id, 'PAPER_UPLOADED',
       json_build_object('title', p.title, 'visibility', p.visibility)::jsonb,
       p.uploaded_at
FROM papers p
WHERE NOT EXISTS (
  SELECT 1 FROM paper_audit_log al
  WHERE al.paper_id = p.id AND al.event_type = 'PAPER_UPLOADED'
)
ON CONFLICT DO NOTHING;
