// src/app/api/cron/prune-cache/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Delete expired cache rows, returning the count for audit logging
    const result = await db.query(`
      WITH deleted AS (
        DELETE FROM response_cache 
        WHERE expires_at < NOW() 
        RETURNING 1
      ) 
      SELECT COUNT(*)::int AS count FROM deleted;
    `);

    const prunedCount = result[0]?.count || 0;

    return NextResponse.json({ 
      success: true, 
      prunedRows: prunedCount
    });
  } catch (error: any) {
    console.error('Cache pruning error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Pruning failed' }, { status: 500 });
  }
}
