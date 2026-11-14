-- ==============================================================================
-- FR-31: One-to-One Direct Messaging
-- Target: PostgreSQL 15+
--
-- Description:
--   Supports private, persistent 1-to-1 direct messaging between registered users.
--   Designed with future extensibility for FR-32 (groups) via conversation types.
--
-- Tables created:
--   1. conversations              — Top-level conversation container
--   2. conversation_participants  — Junction table mapping users to conversations
--   3. direct_messages            — Chronological messages within conversations
--
-- Rollback / Reversibility:
--   DROP TABLE IF EXISTS direct_messages;
--   DROP TABLE IF EXISTS conversation_participants;
--   DROP TABLE IF EXISTS conversations;
-- ==============================================================================

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL DEFAULT 'DIRECT' CHECK (type IN ('DIRECT', 'GROUP')),
    title VARCHAR(255),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations (type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);

-- 2. Conversation Participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversation_participant UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_conv_id ON conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user_id ON conversation_participants (user_id);

-- 3. Direct Messages table
CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (TRIM(content) <> ''),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conv_id ON direct_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages (created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread ON direct_messages (conversation_id, is_read) WHERE is_read = FALSE;
