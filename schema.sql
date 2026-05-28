-- schema.sql
-- Setup file for the LLMWatch Database Schema

-- Enable UUID extension if not enabled (useful on raw Postgres installations)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Model Pricing Catalog
CREATE TABLE IF NOT EXISTS models_catalog (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    cost_per_1k_prompt_tokens NUMERIC(10, 6) DEFAULT 0,
    cost_per_1k_completion_tokens NUMERIC(10, 6) DEFAULT 0,
    UNIQUE(provider, model_name)
);

-- Seed models
INSERT INTO models_catalog (provider, model_name, cost_per_1k_prompt_tokens, cost_per_1k_completion_tokens) VALUES
('openai', 'gpt-4-turbo', 0.010, 0.030),
('openai', 'gpt-3.5-turbo', 0.0005, 0.0015),
('openai', 'gpt-4o', 0.005, 0.015),
('openai', 'gpt-4o-mini', 0.000150, 0.000600),
('anthropic', 'claude-3-opus-20240229', 0.015, 0.075),
('anthropic', 'claude-3-haiku-20240307', 0.00025, 0.00125),
('anthropic', 'claude-3-5-sonnet-20240620', 0.003, 0.015),
('google', 'gemini-1.5-pro', 0.007, 0.021),
('google', 'gemini-1.5-flash', 0.000375, 0.00115),
('ollama', 'ollama/*', 0.00, 0.00),
('vllm', 'vllm/*', 0.00, 0.00)
ON CONFLICT (provider, model_name) DO NOTHING;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- 3. Hardened Events Table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    request_id VARCHAR(255),
    prompt_hash VARCHAR(64),
    customer_identifier VARCHAR(255),
    provider VARCHAR(50),
    model VARCHAR(100),
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    latency_ms INT,
    error_message TEXT,
    is_cached BOOLEAN DEFAULT false,
    request_payload JSONB,
    response_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Crucial: Prevents duplicate ingestion from SDK retries
    UNIQUE(project_id, idempotency_key)
);

-- Analytics & Search Indexes
CREATE INDEX IF NOT EXISTS idx_events_project_time ON events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_prompt_hash ON events(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_identifier);

-- Enables rapid time-bound filtering per project and prompt (covering index for regressions)
CREATE INDEX IF NOT EXISTS idx_events_regression_engine 
ON events(project_id, prompt_hash, created_at DESC) 
INCLUDE (latency_ms, error_message, prompt_tokens); 

-- Full-Text Search GIN Index combining request and response payload
CREATE INDEX IF NOT EXISTS idx_events_fts 
ON events USING GIN (
    to_tsvector(
        'english', 
        COALESCE(request_payload::text, '') || ' ' || COALESCE(response_payload::text, '')
    )
);

-- Fast JSONB path lookup for specific keys (e.g. metadata tags in request)
CREATE INDEX IF NOT EXISTS idx_events_jsonb_path 
ON events USING GIN (request_payload jsonb_path_ops);

-- 4. Dead Letter Queue
CREATE TABLE IF NOT EXISTS ingestion_dead_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    raw_payload JSONB NOT NULL,
    error_reason TEXT NOT NULL,
    source_ip VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Hourly Rollup Table
CREATE TABLE IF NOT EXISTS prompt_hourly_stats (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt_hash VARCHAR(64) NOT NULL,
    hour_bucket TIMESTAMPTZ NOT NULL,
    req_count INT NOT NULL,
    error_count INT NOT NULL,
    p95_latency_ms NUMERIC NOT NULL,
    avg_tokens NUMERIC,
    PRIMARY KEY (project_id, prompt_hash, hour_bucket)
);

-- 6. Response Cache Table
CREATE TABLE IF NOT EXISTS response_cache (
    cache_key VARCHAR(64) PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider VARCHAR(50),
    model VARCHAR(100),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_cache_expiry ON response_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_response_cache_project ON response_cache(project_id);

-- 7. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enum for strict role enforcement
DO $$ BEGIN
    CREATE TYPE role_type AS ENUM ('owner', 'admin', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Project Members (RBAC) Table
CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role role_type NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- 8. API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) DEFAULT 'Default Key',
    prefix VARCHAR(20) NOT NULL, -- display visible part (e.g. 'lw_live_8f9a...')
    key_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of plain key
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

-- 9. Projects Table Schema Migrations (Phase 1 & 2)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monthly_events_limit INT DEFAULT 50000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monthly_events_count INT DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'free';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';

-- 10. Events Table Tracing Migrations (Phase 4 Spans)
ALTER TABLE events ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_span_id UUID REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS span_type VARCHAR(50) DEFAULT 'llm';
ALTER TABLE events ADD COLUMN IF NOT EXISTS span_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_events_trace_id ON events(trace_id);

-- 11. Events Table Execution Replay Migrations (Phase 5)
ALTER TABLE events ADD COLUMN IF NOT EXISTS execution_order INT DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS state_snapshot JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reasoning_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS duration_breakdown JSONB;

-- 12. Events Table Token Flow Migrations (Phase 7)
ALTER TABLE events ADD COLUMN IF NOT EXISTS token_breakdown JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS context_window_used INT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS context_window_max INT;
