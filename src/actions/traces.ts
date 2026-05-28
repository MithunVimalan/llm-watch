// src/actions/traces.ts
'use server';

import { db } from '@/lib/db';
import { withProjectAccess } from '@/lib/auth';

export async function searchTraces(projectId: string, searchTerm: string = '', limit: number = 50) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    
    // If no search term, fetch recent events
    if (!searchTerm.trim()) {
      return await db.query(`
        SELECT 
          id, created_at, provider, model, latency_ms, cost_usd, 
          error_message, is_cached, prompt_tokens, completion_tokens,
          request_payload, response_payload, trace_id, parent_span_id,
          span_type, span_name, execution_order, state_snapshot,
          reasoning_text, duration_breakdown, token_breakdown,
          context_window_used, context_window_max
        FROM events 
        WHERE project_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [projectId, limit]);
    }

    // Full-Text Search using websearch_to_tsquery on GIN index
    return await db.query(`
      SELECT 
        id, created_at, provider, model, latency_ms, cost_usd, 
        error_message, is_cached, prompt_tokens, completion_tokens,
        request_payload, response_payload, trace_id, parent_span_id,
        span_type, span_name, execution_order, state_snapshot,
        reasoning_text, duration_breakdown, token_breakdown,
        context_window_used, context_window_max
      FROM events 
      WHERE project_id = $1 
        AND to_tsvector('english', COALESCE(request_payload::text, '') || ' ' || COALESCE(response_payload::text, '')) 
            @@ websearch_to_tsquery('english', $2)
      ORDER BY created_at DESC
      LIMIT $3
    `, [projectId, searchTerm, limit]);
  });
}

export async function getTraceTree(projectId: string, traceId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    if (!traceId) return [];
    return await db.query(`
      SELECT 
        id, created_at, provider, model, latency_ms, cost_usd, 
        error_message, is_cached, prompt_tokens, completion_tokens,
        request_payload, response_payload, trace_id, parent_span_id,
        span_type, span_name, execution_order, state_snapshot,
        reasoning_text, duration_breakdown, token_breakdown,
        context_window_used, context_window_max
      FROM events 
      WHERE project_id = $1 AND trace_id = $2
      ORDER BY execution_order ASC, created_at ASC
    `, [projectId, traceId]);
  });
}
