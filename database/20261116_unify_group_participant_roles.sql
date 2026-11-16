-- ==============================================================================
-- FR-32 / FR-33 / FR-34: Unify group participant roles
-- Target: PostgreSQL 15+
--
-- Description:
--   Reconciles group schema after both messaging-group migrations.
--   Keeps public/private groups, membership status, and group_messages.
--   Normalizes conversation_participants.role to OWNER, ADMIN, MEMBER.
--
-- This file is safe to run after either 20261114_group_membership.sql,
-- 20261114_messaging_groups.sql, or both.
-- ==============================================================================

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'joined';

UPDATE conversation_participants
SET role = CASE LOWER(role)
    WHEN 'owner' THEN 'OWNER'
    WHEN 'admin' THEN 'ADMIN'
    WHEN 'member' THEN 'MEMBER'
    ELSE 'MEMBER'
END
WHERE role IS NULL
   OR role NOT IN ('OWNER', 'ADMIN', 'MEMBER');

UPDATE conversation_participants cp
SET role = 'OWNER'
FROM conversations c
WHERE c.id = cp.conversation_id
  AND c.type = 'GROUP'
  AND c.created_by = cp.user_id
  AND cp.role <> 'OWNER';

ALTER TABLE conversation_participants
    ALTER COLUMN role SET DEFAULT 'MEMBER';

ALTER TABLE conversation_participants
    DROP CONSTRAINT IF EXISTS chk_group_participant_role;

ALTER TABLE conversation_participants
    ADD CONSTRAINT chk_group_participant_role
    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_group_participant_status'
    ) THEN
        ALTER TABLE conversation_participants
            ADD CONSTRAINT chk_group_participant_status
            CHECK (status IN ('joined', 'pending_approval', 'invited'));
    END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_conv_participants_role ON conversation_participants (role);
