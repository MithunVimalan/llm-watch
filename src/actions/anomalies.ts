// src/actions/anomalies.ts
'use server';

import { db } from '@/lib/db';
import { withProjectAccess } from '@/lib/auth';

export async function getRecentAnomalies(projectId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    return await db.query(
      `SELECT 
         a.id, 
         a.trace_id, 
         a.anomaly_type, 
         a.severity, 
         a.description, 
         a.metadata, 
         a.detected_at,
         e.span_name as root_span_name,
         e.model as root_model
       FROM anomalies a
       LEFT JOIN events e ON e.trace_id = a.trace_id AND e.parent_span_id IS NULL
       WHERE a.project_id = $1
       ORDER BY a.detected_at DESC
       LIMIT 100`,
      [projectId]
    );
  });
}

export async function getAnomalyCount(projectId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    const res = await db.query(
      `SELECT COUNT(*)::int as count 
       FROM anomalies 
       WHERE project_id = $1`,
      [projectId]
    );
    return res[0]?.count || 0;
  });
}
