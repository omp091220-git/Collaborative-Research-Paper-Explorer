-- ==============================================================================
-- Migration: 20261123_post_sharing.sql
-- Feature: FR-29 - Share Posts & Share References
-- Group: Group-19 | IT314 Software Engineering
--
-- PURPOSE:
-- 1. Extends the posts table with share tracking fields:
--    - share_token: unique URL-safe string for shareable links
--    - share_count: total times the post has been shared
--    - shared_post_id: reference to original post for in-platform sharing by reference
-- 2. Introduces post_shares table for auditing share events (link copies & platform shares)
-- 3. Ensures strict non-destructive changes with backward compatibility.
-- ==============================================================================

-- 1. Add share_token to posts table for shareable links
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;

-- 2. Add share_count to posts table
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0);

-- 3. Add shared_post_id to posts table for in-platform reference sharing
-- Enables creating a post that references another post without copying its content
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- 4. Create post_shares table to track share events
CREATE TABLE IF NOT EXISTS post_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    share_type VARCHAR(20) NOT NULL DEFAULT 'LINK' CHECK (share_type IN ('LINK', 'PLATFORM')),
    commentary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes for performant lookups
CREATE INDEX IF NOT EXISTS idx_posts_share_token
    ON posts (share_token)
    WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_shared_post_id
    ON posts (shared_post_id)
    WHERE shared_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id
    ON post_shares (post_id);

CREATE INDEX IF NOT EXISTS idx_post_shares_user_id
    ON post_shares (user_id);
