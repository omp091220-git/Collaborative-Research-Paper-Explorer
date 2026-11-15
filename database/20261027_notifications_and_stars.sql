-- ==============================================================================
-- Migration: 20261027_notifications_and_stars.sql
-- Notification System, Paper Starring & Comments / Discussions
-- ==============================================================================

-- 1. Extend users with username for stable @username mentions
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- Populate existing users with email username prefix if username is null
UPDATE users
SET username = LOWER(SPLIT_PART(email, '@', 1))
WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username
    ON users (LOWER(username))
    WHERE username IS NOT NULL;

-- 2. Paper Starring
-- Tracks which users have starred / bookmarked a paper.
CREATE TABLE IF NOT EXISTS paper_stars (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id   UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_stars_paper_id ON paper_stars (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_stars_user_id ON paper_stars (user_id);

-- 3. Paper Discussions / Comments
-- User-generated threaded comments on research papers supporting user mentions.
CREATE TABLE IF NOT EXISTS paper_comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id   UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT        NOT NULL CHECK (TRIM(content) <> ''),
    parent_id  UUID        REFERENCES paper_comments(id) ON DELETE CASCADE,
    annotation_id UUID     REFERENCES annotations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE paper_comments ADD COLUMN IF NOT EXISTS annotation_id UUID REFERENCES annotations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_paper_comments_paper_id ON paper_comments (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_comments_user_id ON paper_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_paper_comments_annotation_id ON paper_comments (annotation_id);

-- 4. Notifications Table
-- Stores in-app user notifications for mentions, paper tag changes, and paper updates.
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    type         VARCHAR(50)  NOT NULL, -- 'MENTION', 'PAPER_TAG_CHANGE', 'PAPER_METADATA_UPDATE'
    title        VARCHAR(255) NOT NULL,
    message      TEXT         NOT NULL,
    paper_id     UUID         REFERENCES papers(id) ON DELETE CASCADE,
    source_type  VARCHAR(50),           -- 'annotation', 'comment', 'paper_tag', 'paper_metadata'
    source_id    UUID,
    data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    link         TEXT,
    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_paper_id ON notifications (paper_id);
