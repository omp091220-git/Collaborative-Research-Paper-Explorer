-- ==============================================================================
-- FR-32: Create Messaging Groups
-- Target: PostgreSQL 15+
--
-- Description:
--   Establishes the foundation for group messaging and membership.
--   Reuses existing conversations and conversation_participants tables.
--   Adds description to conversations for group context/topic,
--   and adds participant role ('OWNER', 'ADMIN', 'MEMBER') to conversation_participants.
--
-- Rollback / Reversibility:
--   ALTER TABLE conversation_participants DROP COLUMN IF EXISTS role;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS description;
-- ==============================================================================

-- 1. Ensure conversations table exists (safe creation if running independently)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL DEFAULT 'GROUP' CHECK (type IN ('DIRECT', 'GROUP')),
    title VARCHAR(255),
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure description column exists if conversations table was previously created
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations (type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);

-- 2. Ensure conversation_participants table exists
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversation_participant UNIQUE (conversation_id, user_id)
);

-- Ensure role column exists if conversation_participants table was previously created
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'MEMBER';

CREATE INDEX IF NOT EXISTS idx_conv_participants_conv_id ON conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user_id ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_role ON conversation_participants (role);
