// src/lib/services/analytics.ts
import { db } from '@/lib/db';

export interface RegressionThresholds {
  minRequests?: number;
}

export async function detectPromptRegressions(
  projectId: string, 
  config: RegressionThresholds = { minRequests: 10 }
) {
  const minRequests = config.minRequests ?? 10;
  
  // Compares prompt metrics over the last 24h (current) vs 24h-48h ago (baseline).
  // Uses LEFT JOIN to ensure we catch regressions even if the prompt is newly introduced
  // or has no baseline history.
  const query = `
    WITH current_window AS (
        SELECT 
            prompt_hash,
            COUNT(*)::int as req_count,
            SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as error_rate,
            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float as p95_latency,
            COALESCE(AVG(prompt_tokens), 0)::float as avg_prompt_tokens
        FROM events
        WHERE project_id = $1
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY prompt_hash
    ),
    baseline_window AS (
        SELECT 
            prompt_hash,
            COUNT(*)::int as req_count,
            SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as error_rate,
            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float as p95_latency,
            COALESCE(AVG(prompt_tokens), 0)::float as avg_prompt_tokens
        FROM events
        WHERE project_id = $1
          AND created_at >= NOW() - INTERVAL '48 hours'
          AND created_at < NOW() - INTERVAL '24 hours'
        GROUP BY prompt_hash
    )
    SELECT 
        c.prompt_hash,
        c.req_count as current_requests,
        c.error_rate as current_error_rate,
        (c.error_rate - COALESCE(b.error_rate, 0))::float as error_rate_delta,
        c.p95_latency as current_p95_ms,
        COALESCE(b.p95_latency, 0) as baseline_p95_ms,
        CASE WHEN COALESCE(b.p95_latency, 0) > 0 
             THEN ((c.p95_latency - b.p95_latency) / b.p95_latency) * 100 
             ELSE 0 
        END::float as latency_increase_pct,
        c.avg_prompt_tokens,
        COALESCE(b.avg_prompt_tokens, 0) as baseline_avg_tokens
    FROM current_window c
    LEFT JOIN baseline_window b ON c.prompt_hash = b.prompt_hash
    WHERE 
        c.req_count >= $2 AND (
          -- THE REGRESSION THRESHOLDS (Adjustable)
          -- 1. Error rate increased by more than 5%
          (c.error_rate - COALESCE(b.error_rate, 0)) > 0.05 
          OR
          -- 2. p95 Latency increased by more than 20%
          (CASE WHEN COALESCE(b.p95_latency, 0) > 0 THEN ((c.p95_latency - b.p95_latency) / b.p95_latency) ELSE 0 END) > 0.20
          OR
          -- 3. Token bloat: prompt size grew by more than 15%
          (CASE WHEN COALESCE(b.avg_prompt_tokens, 0) > 0 THEN ((c.avg_prompt_tokens - b.avg_prompt_tokens) / b.avg_prompt_tokens) ELSE 0 END) > 0.15
        )
    ORDER BY latency_increase_pct DESC, error_rate_delta DESC;
  `;

  return await db.query(query, [projectId, minRequests]);
}
