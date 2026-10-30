-- ==============================================================================
-- FR-17 & FR-18: Contextual Discussions, Mentions, and Collaborator Permissions
-- Target: PostgreSQL 15+
-- ==============================================================================

-- 1. Paper Collaborators
CREATE TABLE IF NOT EXISTS paper_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('VIEW', 'COMMENT', 'EDIT')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_paper_collaborator UNIQUE (paper_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_collaborators_paper_id ON paper_collaborators (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_collaborators_user_id ON paper_collaborators (user_id);

-- 2. Paper Invitations
CREATE TABLE IF NOT EXISTS paper_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    invited_email VARCHAR(255) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('VIEW', 'COMMENT', 'EDIT')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED')),
    token VARCHAR(64) UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_paper_invitations_paper_id ON paper_invitations (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_invitations_invited_email ON paper_invitations (LOWER(invited_email));
CREATE INDEX IF NOT EXISTS idx_paper_invitations_status ON paper_invitations (status);

-- 3. Discussion Threads (anchored to text highlights, figures, annotations, or general)
CREATE TABLE IF NOT EXISTS discussion_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255),
    anchor_type VARCHAR(50) NOT NULL DEFAULT 'text_highlight'
        CHECK (anchor_type IN ('text_highlight', 'figure', 'annotation', 'general')),
    anchor_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    annotation_id UUID REFERENCES annotations(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discussion_threads_paper_id ON discussion_threads (paper_id);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_created_by ON discussion_threads (created_by);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_annotation_id ON discussion_threads (annotation_id);

-- 4. Discussion Messages & Threaded Replies
CREATE TABLE IF NOT EXISTS discussion_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES discussion_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL CHECK (TRIM(content) <> ''),
    mentions TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discussion_messages_thread_id ON discussion_messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_discussion_messages_parent_id ON discussion_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_discussion_messages_user_id ON discussion_messages (user_id);

-- 5. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (user_id, is_read);
