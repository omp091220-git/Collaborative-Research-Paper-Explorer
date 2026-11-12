-- ==============================================================================
-- Migration: GenAI API Token Consumption & Cost Tracking
-- Purpose: Records token consumption (prompt/completion), costs, and model metrics
--          for monitoring and administrative visibility without fabricating values.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS genai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    is_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    operation_type VARCHAR(50) NOT NULL DEFAULT 'summary',
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_genai_usage_created_at
    ON genai_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_genai_usage_user_id
    ON genai_usage_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_genai_usage_paper_id
    ON genai_usage_logs (paper_id);

CREATE INDEX IF NOT EXISTS idx_genai_usage_model
    ON genai_usage_logs (model_name);

CREATE INDEX IF NOT EXISTS idx_genai_usage_provider
    ON genai_usage_logs (provider);
