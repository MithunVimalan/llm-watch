// src/app/dashboard/[projectId]/page.tsx
import { db } from '@/lib/db';
import { withProjectAccess } from '@/lib/auth';
import { detectPromptRegressions } from '@/lib/services/analytics';
import DashboardOverview from './DashboardOverview';
import React from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ projectId: string }> | { projectId: string };
}

export default async function DashboardPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { projectId } = resolvedParams;

  // Secure data loading via withProjectAccess RBAC wrapper
  const data = await withProjectAccess(projectId, 'viewer', async () => {
    // 1. Fetch regressions (min requests 1 for testing)
    const regressions = await detectPromptRegressions(projectId, { minRequests: 1 });
    
    // 2. Fetch 24-hour summary metrics
    const stats = await db.query(`
      SELECT 
        COUNT(*)::int as total_requests,
        COALESCE(SUM(cost_usd), 0)::float as total_cost,
        COALESCE(SUM(CASE WHEN is_cached THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0)::float as cache_hit_rate
      FROM events 
      WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
    `, [projectId]).then(res => res[0] || { total_requests: 0, total_cost: 0, cache_hit_rate: 0 });

    // 3. Fetch models pricing list
    const modelsCatalog = await db.query(`
      SELECT provider, model_name, cost_per_1k_prompt_tokens, cost_per_1k_completion_tokens 
      FROM models_catalog 
      ORDER BY provider, model_name
    `);

    // 4. Fetch Dead-Letter Queue ingestion logs
    const dlq = await db.query(`
      SELECT id, created_at, error_reason, source_ip, raw_payload 
      FROM ingestion_dead_letter 
      WHERE project_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [projectId]);

    // 5. Fetch project totals and checklist checklist
    const totalLifetime = await db.query(`
      SELECT COUNT(*)::int as count FROM events WHERE project_id = $1
    `, [projectId]).then(res => res[0]?.count || 0);

    const activeKey = await db.query(`
      SELECT prefix FROM api_keys 
      WHERE project_id = $1 AND revoked_at IS NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [projectId]).then(res => res[0]);

    const hasCache = await db.query(`
      SELECT COUNT(*)::int as count 
      FROM events 
      WHERE project_id = $1 AND is_cached = true
    `, [projectId]).then(res => (res[0]?.count || 0) > 0);

    const hasDlq = await db.query(`
      SELECT COUNT(*)::int as count 
      FROM ingestion_dead_letter 
      WHERE project_id = $1
    `, [projectId]).then(res => (res[0]?.count || 0) > 0);

    return {
      regressions,
      stats,
      modelsCatalog,
      dlq,
      checklist: {
        hasKey: !!activeKey,
        hasEvents: totalLifetime > 0,
        hasCache,
        hasDlq,
        activePrefix: activeKey ? activeKey.prefix : ''
      }
    };
  });

  return (
    <DashboardOverview
      projectId={projectId}
      stats={data.stats}
      regressions={data.regressions}
      modelsCatalog={data.modelsCatalog}
      dlq={data.dlq}
      checklist={data.checklist}
    />
  );
}
