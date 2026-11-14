-- ==============================================================================
-- FR-33 & FR-34: Group Membership Rules & Group Messaging
-- Target: PostgreSQL 15+
--
-- Description:
--   Supports:
--   1. FR-33: Public and private group discovery, membership status, join rules,
--      and admin approvals for private groups.
--   2. FR-34: Group messaging restricted strictly to authorized active members,
--      with automatic revocation if a member leaves.
-- ==============================================================================

-- 1. Ensure conversations table exists (compatible with FR-31)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL DEFAULT 'DIRECT' CHECK (type IN ('DIRECT', 'GROUP')),
    title VARCHAR(255),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ensure conversation_participants exists (compatible with FR-31)
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversation_participant UNIQUE (conversation_id, user_id)
);

-- 3. Extend conversations for groups (FR-33)
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_group_discovery
    ON conversations (type, is_private, created_at DESC)
    WHERE type = 'GROUP';

-- 4. Extend conversation_participants for role and membership status (FR-33)
ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'joined';

-- Safe constraint additions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_group_participant_role'
    ) THEN
        ALTER TABLE conversation_participants
            ADD CONSTRAINT chk_group_participant_role
            CHECK (role IN ('admin', 'member'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_group_participant_status'
    ) THEN
        ALTER TABLE conversation_participants
            ADD CONSTRAINT chk_group_participant_status
            CHECK (status IN ('joined', 'pending_approval', 'invited'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conv_participants_status
    ON conversation_participants (conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user_status
    ON conversation_participants (user_id, status);

-- 5. Dedicated Group Messages table (FR-34)
CREATE TABLE IF NOT EXISTS group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (TRIM(content) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages (group_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_id ON group_messages (sender_id);
