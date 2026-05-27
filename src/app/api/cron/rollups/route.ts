// src/app/api/cron/rollups/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db'; 

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Aggregates raw events from the previous hour (e.g. between 1:00 PM and 2:00 PM if run at 2:05 PM)
    // and upserts the result.
    await db.query(`
      INSERT INTO prompt_hourly_stats (
        project_id, 
        prompt_hash, 
        hour_bucket, 
        req_count, 
        error_count, 
        p95_latency_ms, 
        avg_tokens
      )
      SELECT 
        project_id,
        prompt_hash,
        date_trunc('hour', created_at) AS hour_bucket,
        COUNT(*) as req_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as error_count,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95_latency_ms,
        COALESCE(AVG(prompt_tokens + completion_tokens), 0) as avg_tokens
      FROM events
      WHERE created_at >= date_trunc('hour', NOW() - INTERVAL '1 hour')
        AND created_at < date_trunc('hour', NOW())
        AND prompt_hash IS NOT NULL
      GROUP BY project_id, prompt_hash, date_trunc('hour', created_at)
      
      ON CONFLICT (project_id, prompt_hash, hour_bucket) 
      DO UPDATE SET
        req_count = EXCLUDED.req_count,
        error_count = EXCLUDED.error_count,
        p95_latency_ms = EXCLUDED.p95_latency_ms,
        avg_tokens = EXCLUDED.avg_tokens;
    `);

    return NextResponse.json({ success: true, message: 'Hourly rollup completed successfully.' });
  } catch (error: any) {
    console.error('Rollup error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Rollup failed' }, { status: 500 });
  }
}
