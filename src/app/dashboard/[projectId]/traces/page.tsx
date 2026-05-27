// src/app/dashboard/[projectId]/traces/page.tsx
import { searchTraces } from '@/actions/traces';
import TraceList from './TraceList';
import React from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ projectId: string }> | { projectId: string };
  searchParams: Promise<{ q?: string }> | { q?: string };
}

export default async function TracesPage({ params, searchParams }: PageProps) {
  // Resolve Next.js 15 async parameters
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const { projectId } = resolvedParams;
  const searchTerm = resolvedSearchParams.q || '';

  // Retrieve traces (authenticated via withProjectAccess in searchTraces)
  const rawTraces = await searchTraces(projectId, searchTerm, 100);

  // Cast retrieved database rows to structured Trace array
  const traces = rawTraces.map((row: any) => ({
    id: row.id,
    created_at: row.created_at.toISOString(),
    provider: row.provider,
    model: row.model,
    latency_ms: row.latency_ms,
    cost_usd: row.cost_usd ? Number(row.cost_usd) : null,
    error_message: row.error_message,
    is_cached: row.is_cached,
    prompt_tokens: row.prompt_tokens || 0,
    completion_tokens: row.completion_tokens || 0,
    request_payload: row.request_payload,
    response_payload: row.response_payload,
    trace_id: row.trace_id,
    parent_span_id: row.parent_span_id,
    span_type: row.span_type,
    span_name: row.span_name
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Trace Logs</h1>
        <p className="text-slate-400 mt-1">
          Perform lightning-fast full-text searches across raw JSON request and response payloads.
        </p>
      </div>

      <TraceList 
        traces={traces} 
        projectId={projectId} 
        initialSearch={searchTerm} 
      />
    </div>
  );
}
