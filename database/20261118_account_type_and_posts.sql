-- ==============================================================================
-- Migration: 20261118_account_type_and_posts.sql
-- Feature: FR-25 - Account Type and Post Visibility Enforcement
-- Group: Group-19 | IT314 Software Engineering
--
-- PURPOSE:
-- 1. Adds backward-compatible user account visibility ('PUBLIC', 'PRIVATE') to users table.
-- 2. Introduces the posts table supporting public and private posts with audit timestamps.
-- 3. Introduces post_permissions table for granular private post sharing (supports FR-30).
-- 4. Creates composite indexes for fast feed querying, author lookups, and visibility filtering.
--
-- SAFE CHANGE GUARANTEES:
-- - Non-destructive (ADD COLUMN IF NOT EXISTS, default 'PUBLIC' for existing users).
-- - Zero data loss: Existing user records, sessions, and roles remain 100% untouched.
-- ==============================================================================

-- 1. Create enum for User Account Type (PUBLIC / PRIVATE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_account_type') THEN
        CREATE TYPE user_account_type AS ENUM ('PUBLIC', 'PRIVATE');
    END IF;
END $$;

-- 2. Safely add account_type column to users table with default 'PUBLIC'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_type user_account_type NOT NULL DEFAULT 'PUBLIC';

-- 3. Create enum for Post Visibility (PUBLIC / PRIVATE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_visibility') THEN
        CREATE TYPE post_visibility AS ENUM ('PUBLIC', 'PRIVATE');
    END IF;
END $$;

-- 4. Create Posts Table
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    visibility post_visibility NOT NULL DEFAULT 'PUBLIC',
    like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Performance and Query Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_posts_author_id 
    ON posts (author_id);

CREATE INDEX IF NOT EXISTS idx_posts_visibility_created 
    ON posts (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_paper_id 
    ON posts (paper_id) 
    WHERE paper_id IS NOT NULL;

-- 6. Foundation for FR-30: Private Post Access Permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_permission_level') THEN
        CREATE TYPE post_permission_level AS ENUM ('READ', 'WRITE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS post_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_level post_permission_level NOT NULL DEFAULT 'READ',
    granted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_post_user_permission UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_permissions_user 
    ON post_permissions (user_id);
