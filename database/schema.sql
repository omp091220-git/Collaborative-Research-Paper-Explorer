-- ==============================================================================
-- Collaborative Research Paper Explorer
-- Target: Neon PostgreSQL (PostgreSQL 15+)
-- Phase 1 Schema — Reviewed & Improved
--
-- ENFORCEMENT BOUNDARY NOTES:
--   [DB]      = enforced by PostgreSQL constraints, triggers, or indexes.
--   [BACKEND] = must be enforced by application code before reaching the DB.
--   [BOTH]    = both layers should enforce this for defence-in-depth.
-- ==============================================================================

-- NOTE: No extensions needed.
-- gen_random_uuid() is a PostgreSQL core built-in since PostgreSQL 13.
-- pgcrypto is NOT loaded: password hashing must be done in backend code. [BACKEND]


-- ==============================================================================
-- 1. ENUM TYPES
-- ==============================================================================

-- User roles.
-- SYSTEM_ADMIN must never be assignable through public registration. [BOTH]
-- A trigger below (trg_block_public_admin_insert) adds a DB-level guard on INSERT.
-- Backend must also guard role UPDATE to SYSTEM_ADMIN behind a privileged endpoint.
CREATE TYPE user_role AS ENUM (
    'STUDENT',
    'RESEARCHER',
    'SYSTEM_ADMIN',
    'SYSTEM ADMIN'
);



-- Collaboration roles within a collection.
CREATE TYPE collection_role AS ENUM (
    'OWNER',     -- Full control: rename, delete, manage members.
    'EDITOR',    -- Can add/remove papers, manage non-owner members.
    'VIEWER'     -- Read-only access.
);

-- Allowed AI summary types.
CREATE TYPE summary_type AS ENUM (
    'comprehensive',
    'brief',
    'technical',
    'layperson'
);


-- ==============================================================================
-- 2. SHARED TRIGGER FUNCTION: updated_at
-- ==============================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 3. TABLES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABLE: users
--
-- Stores all registered accounts.
-- Password storage: ONLY the hash is stored here. [BACKEND] must hash passwords
-- using bcrypt, argon2id, or similar before any INSERT/UPDATE.
-- Email uniqueness is case-insensitive. [DB] partial unique index on LOWER(email).
-- SYSTEM_ADMIN role is blocked on public INSERT by a trigger. [DB]
-- Role escalation to SYSTEM_ADMIN on UPDATE must be blocked by [BACKEND].
-- Deletion is blocked while the user owns papers (see papers FK). [DB]
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- Argon2id / bcrypt hash only. [BACKEND]
    full_name     VARCHAR(150) NOT NULL,
    role          user_role    NOT NULL DEFAULT 'STUDENT',
    affiliation   VARCHAR(255),
    research_interests TEXT[]       NOT NULL DEFAULT '{}',
    email_verified BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Basic structural email check. Full validation is a [BACKEND] responsibility.
    CONSTRAINT chk_users_email_format CHECK (
        email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    ),
    -- Full name empty not allowed
    CONSTRAINT chk_users_full_name_nonempty CHECK (
        TRIM(full_name) <> ''
    ),
    -- Ensure research interests are not null.
    CONSTRAINT chk_users_research_interests_notnull CHECK (
        research_interests IS NOT NULL
    )
);



CREATE INDEX idx_users_research_interests ON users USING GIN (research_interests);
-- Case-insensitive unique email. [DB]
CREATE UNIQUE INDEX idx_users_email_ci ON users (LOWER(email));

-- Useful for admin dashboards listing users by role. [DB]
CREATE INDEX idx_users_role ON users (role);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Guard: block any direct INSERT with role = SYSTEM_ADMIN. [DB]
-- Public registration code paths will hit this trigger.
-- Only a superuser / migration script executing outside normal app flow
-- (e.g., a one-time seed script run by a DBA) should create admin accounts.
CREATE OR REPLACE FUNCTION fn_block_public_admin_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role::text = 'SYSTEM_ADMIN' OR NEW.role::text = 'SYSTEM ADMIN' THEN
        RAISE EXCEPTION
            'Direct INSERT with role SYSTEM_ADMIN is not permitted. '
            'Use the privileged admin-provisioning procedure.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_public_admin_insert
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION fn_block_public_admin_insert();


-- ------------------------------------------------------------------------------
-- TABLE: papers
--
-- Stores paper metadata and a reference to the file in object storage.
-- The actual PDF binary is NEVER stored in PostgreSQL. [BACKEND] uploads the
-- file to object storage (S3, Cloudflare R2, etc.) and stores the path/URL here.
--
-- File size limit: 30 MiB = 31,457,280 bytes. [BOTH]
--   [DB] enforces via CHECK on file_size_bytes.
--   [BACKEND] must also reject oversized uploads before streaming to storage.
--
-- MIME type: [DB] CHECK ensures only 'application/pdf' is recorded.
--   [BACKEND] must verify the actual file magic bytes, not just the Content-Type
--   header, which can be spoofed.
--
-- Uploader cannot be deleted while they have uploaded papers. [DB] ON DELETE RESTRICT.
-- ArXiv ID uniqueness is sparse (NULL rows are excluded). [DB] partial unique index.
-- ------------------------------------------------------------------------------
CREATE TABLE papers (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT         NOT NULL,
    abstract        TEXT,
    -- Ordered array of author name strings, e.g. '{"Alice Smith","Bob Jones"}'
    authors         TEXT[]       NOT NULL,
    -- Optional arXiv identifier, e.g. '2301.00001' or '2301.00001v2'.
    arxiv_id        VARCHAR(50),
    -- Path or URL in object storage. Must never be the raw file data. [BACKEND]
    file_path       TEXT         NOT NULL,
    -- Byte count of the PDF. 30 MiB ceiling enforced below. [BOTH]
    file_size_bytes BIGINT       NOT NULL,
    -- Must always be 'application/pdf'. [BOTH]
    mime_type       VARCHAR(100) NOT NULL,
    uploader_id     UUID         NOT NULL
                        REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 30 MiB = 30 x 1024 x 1024 = 31,457,280 bytes. [DB]
    CONSTRAINT chk_papers_file_size_max_30mib CHECK (
        file_size_bytes > 0 AND file_size_bytes <= 31457280
    ),
    -- Only PDF files should be recorded. [DB]
    CONSTRAINT chk_papers_mime_type_pdf CHECK (
        mime_type = 'application/pdf'
    ),
    -- file_path must be unique: two papers cannot share the same storage object. [DB]
    CONSTRAINT uq_papers_file_path UNIQUE (file_path),
    -- Title must not be blank. [DB]
    CONSTRAINT chk_papers_title_nonempty CHECK (
        TRIM(title) <> ''
    ),
    -- Must have at least one author. [DB]
    CONSTRAINT chk_papers_authors_nonempty CHECK (
    cardinality(authors) >= 1
)
);

-- Efficiently find all papers uploaded by a specific user. [DB]
CREATE INDEX idx_papers_uploader_id ON papers (uploader_id);

-- Sparse unique index: multiple NULLs are allowed, but non-NULL arXiv IDs must be unique. [DB]
CREATE UNIQUE INDEX idx_papers_arxiv_id ON papers (arxiv_id)
    WHERE arxiv_id IS NOT NULL;

-- Feed sorted by most-recently uploaded. [DB]
CREATE INDEX idx_papers_uploaded_at ON papers (uploaded_at DESC);

-- Array containment / overlap queries on authors (e.g., papers by "Alice Smith"). [DB]
CREATE INDEX idx_papers_authors_gin ON papers USING GIN (authors);

-- Full-text search across title and abstract. [DB]
-- Use to_tsvector with COALESCE so a NULL abstract does not break indexing.
CREATE INDEX idx_papers_fts ON papers USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(abstract, ''))
);

CREATE TRIGGER trg_papers_updated_at
BEFORE UPDATE ON papers
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ------------------------------------------------------------------------------
-- TABLE: paper_summaries
--
-- Each row is one AI-generated summary for one paper.
-- A paper may have multiple summaries (different models, different summary_types).
-- If the paper is deleted, its summaries cascade-delete. [DB]
-- If the requesting user is deleted, generated_by is set to NULL (audit trail
-- kept, user reference cleared). [DB]
-- summary_type is constrained to the summary_type enum. [DB]
-- ------------------------------------------------------------------------------
CREATE TABLE paper_summaries (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id      UUID         NOT NULL
                      REFERENCES papers(id) ON DELETE CASCADE,
    model_name    VARCHAR(100) NOT NULL,
    summary_type  summary_type NOT NULL DEFAULT 'comprehensive',
    summary_text  TEXT         NOT NULL,
    -- Optional structured key findings extracted from the summary.
    key_findings  TEXT[],
    -- The user who triggered summary generation. Nullable for system-triggered jobs.
    generated_by  UUID
                      REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate summaries of the same type by the same model for a paper.
    CONSTRAINT uq_summaries_paper_model_type UNIQUE (paper_id, model_name, summary_type),

    CONSTRAINT chk_summaries_model_name_nonempty CHECK (
        TRIM(model_name) <> ''
    ),
    CONSTRAINT chk_summaries_text_nonempty CHECK (
        TRIM(summary_text) <> ''
    )
);

-- Primary access pattern: fetch all summaries for a given paper. [DB]
CREATE INDEX idx_summaries_paper_id ON paper_summaries (paper_id);

-- Audit / admin: find all summaries triggered by a specific user. [DB]
CREATE INDEX idx_summaries_generated_by ON paper_summaries (generated_by);


-- ------------------------------------------------------------------------------
-- TABLE: collections
--
-- A named group of papers that a user curates.
-- ON DELETE RESTRICT on created_by: a user account cannot be deleted while they
-- still own collections. The owner must first transfer or delete their
-- collections. [DB]
-- is_public controls whether non-members can see the collection. [BACKEND]
-- (PostgreSQL has no concept of "is this user a member"; that check is [BACKEND].)
-- ------------------------------------------------------------------------------
CREATE TABLE collections (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_public   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by  UUID         NOT NULL
                    REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_collections_name_nonempty CHECK (
        TRIM(name) <> ''
    )
);

-- Find all collections belonging to a user. [DB]
CREATE INDEX idx_collections_created_by ON collections (created_by);

-- Efficiently filter public collections for browse/discovery views. [DB]
CREATE INDEX idx_collections_is_public ON collections (is_public)
    WHERE is_public = TRUE;

CREATE TRIGGER trg_collections_updated_at
BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Auto-enroll the collection creator as OWNER in collection_members.
-- This guarantees a consistent membership record exists immediately after
-- collection creation, with no gap between INSERT and a second application call. [DB]
CREATE OR REPLACE FUNCTION fn_enroll_collection_owner()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO collection_members (collection_id, user_id, role, invited_by)
    VALUES (NEW.id, NEW.created_by, 'OWNER', NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_collections_enroll_owner
AFTER INSERT ON collections
FOR EACH ROW EXECUTE FUNCTION fn_enroll_collection_owner();


-- ------------------------------------------------------------------------------
-- TABLE: collection_members
--
-- Records which users have access to a collection and at what role.
-- Composite PK (collection_id, user_id) enforces one role per user per collection. [DB]
-- If a collection is deleted, all memberships cascade-delete. [DB]
-- If a member's user account is deleted, their membership cascades-deletes. [DB]
-- If the inviting user is deleted, invited_by is set to NULL. [DB]
--
-- Role enforcement (who can invite, who can remove) is [BACKEND] logic.
-- ------------------------------------------------------------------------------
CREATE TABLE collection_members (
    collection_id UUID            NOT NULL
                      REFERENCES collections(id) ON DELETE CASCADE,
    user_id       UUID            NOT NULL
                      REFERENCES users(id)       ON DELETE CASCADE,
    role          collection_role NOT NULL DEFAULT 'VIEWER',
    invited_by    UUID
                      REFERENCES users(id)       ON DELETE SET NULL,
    joined_at     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (collection_id, user_id)
);

-- Reverse lookup: all collections a given user belongs to. [DB]
CREATE INDEX idx_collection_members_user_id ON collection_members (user_id);

-- Partial unique index: quickly locate the OWNER of any collection.
-- Ensures only one OWNER row can exist per collection. [DB]
CREATE UNIQUE INDEX idx_collection_members_owner ON collection_members (collection_id)
    WHERE role = 'OWNER';


-- ------------------------------------------------------------------------------
-- TABLE: collection_papers
--
-- Junction table linking papers to collections.
-- Composite PK prevents duplicate paper entries within the same collection. [DB]
-- If a collection is deleted, all its paper-links cascade-delete. [DB]
-- If a paper is deleted, all its collection-links cascade-delete. [DB]
-- If the adding user is deleted, added_by is set to NULL. [DB]
--
-- Access control (can this user add a paper to this collection?) is [BACKEND] logic.
-- ------------------------------------------------------------------------------
CREATE TABLE collection_papers (
    collection_id UUID        NOT NULL
                      REFERENCES collections(id) ON DELETE CASCADE,
    paper_id      UUID        NOT NULL
                      REFERENCES papers(id)      ON DELETE CASCADE,
    added_by      UUID
                      REFERENCES users(id)       ON DELETE SET NULL,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (collection_id, paper_id)
);

-- Reverse lookup: all collections that contain a given paper. [DB]
CREATE INDEX idx_collection_papers_paper_id ON collection_papers (paper_id);

-- Audit: who added papers to collections. [DB]
CREATE INDEX idx_collection_papers_added_by ON collection_papers (added_by);


-- ------------------------------------------------------------------------------
-- TABLE: password_reset_tokens
--
-- Stores secure SHA-256 hashes of time-limited (15-minute) password reset tokens.
-- Tokens are single-use; once consumed, used_at is set to CURRENT_TIMESTAMP.
-- Cascades on user deletion. [DB]
-- ------------------------------------------------------------------------------
CREATE TABLE password_reset_tokens (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast token lookup by hash. [DB]
CREATE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);

-- Fast lookup of user's active reset tokens to invalidate prior tokens. [DB]
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);


-- ------------------------------------------------------------------------------
-- TABLE: email_verification_tokens
--
-- Stores SHA-256 hashes of expiring (24-hour) single-use email verification tokens.
-- ------------------------------------------------------------------------------
CREATE TABLE email_verification_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL
                           REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens (user_id);


-- ------------------------------------------------------------------------------
-- TABLE: sso_identities
--
-- Stores external identity provider subject mappings (e.g., Google Workspace).
-- Prevents duplicate federated associations and binds to local users.
-- ------------------------------------------------------------------------------
CREATE TABLE sso_identities (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID         NOT NULL
                                     REFERENCES users(id) ON DELETE CASCADE,
    provider            VARCHAR(50)  NOT NULL,
    provider_subject_id VARCHAR(255) NOT NULL,
    email               VARCHAR(255),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_sso_provider_subject UNIQUE (provider, provider_subject_id)
);

CREATE INDEX idx_sso_identities_user_id ON sso_identities (user_id);
CREATE INDEX idx_sso_identities_provider_email ON sso_identities (provider, LOWER(email));

-- ------------------------------------------------------------------------------
-- TABLE: user_sessions
--
-- FR-04: Manages active user sessions, server-side token revocation, and idle tracking.
-- Tokens are looked up by secure SHA-256 hash.
-- Sessions expire automatically after 30 minutes of inactivity (last_active_at)
-- or upon reaching the absolute max expiration timestamp (expires_at).
-- Revocation is tracked via revoked_at for explicit logout invalidation.
-- ------------------------------------------------------------------------------
CREATE TABLE user_sessions (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,
    token_hash     VARCHAR(64)  NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMPTZ  NOT NULL,
    revoked_at     TIMESTAMPTZ,
    user_agent     TEXT,
    ip_address     VARCHAR(45)
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX idx_user_sessions_last_active_at ON user_sessions (last_active_at);


-- ==============================================================================
-- 4. FUTURE TABLES (not created yet -- described here for planning)
-- ==============================================================================
--
-- The following tables are intentionally deferred to a later phase:
--
-- notes            -- User-authored free-text notes on a paper.
-- annotations      -- Positional highlights/comments tied to a page/region of a PDF.
-- topic_tags       -- Controlled vocabulary tags; paper_tags junction table links them.
-- comments         -- Threaded comments on papers or collections (parent_id self-ref).
-- notifications    -- Per-user event queue (new member, new paper, new comment, etc.).
-- citations        -- Directed edge table: (citing_paper_id -> cited_paper_id).
--
-- None of the core six tables need modification to accommodate these later tables;
-- they will simply reference papers(id), collections(id), and users(id) via FK.
-- ==============================================================================


-- ==============================================================================
-- FR-08: Structured AI summary metadata, content cache, and background job status
-- This block is additive so it also works when schema.sql initializes a fresh DB.
-- ==============================================================================
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
