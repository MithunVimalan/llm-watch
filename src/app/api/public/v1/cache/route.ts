// src/app/api/public/v1/cache/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashIncomingKey } from '@/lib/crypto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cacheKey = searchParams.get('key');
  const authHeader = req.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '').trim();

  if (!cacheKey || !apiKey) {
    return NextResponse.json({ error: 'Missing key or auth' }, { status: 400 });
  }

  // 1. Auth lookup using API key hash
  const incomingHash = hashIncomingKey(apiKey);
  const project = await db.query(`
    SELECT project_id AS id
    FROM api_keys 
    WHERE key_hash = $1 
      AND revoked_at IS NULL 
      AND (expires_at IS NULL OR expires_at > NOW())
  `, [incomingHash]).then(res => res[0]);

  if (!project) {
    return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
  }

  // 2. Fetch cache entry, ensuring it is not expired
  const cached = await db.query(`
    SELECT response_payload 
    FROM response_cache 
    WHERE cache_key = $1 AND project_id = $2 AND expires_at > NOW()
  `, [cacheKey, project.id]).then(res => res[0]);

  if (!cached) {
    return NextResponse.json({ hit: false });
  }
  
  return NextResponse.json({ hit: true, data: cached.response_payload });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '').trim();
  
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing auth' }, { status: 401 });
  }

  // 1. Auth lookup
  const incomingHash = hashIncomingKey(apiKey);
  const project = await db.query(`
    SELECT project_id AS id
    FROM api_keys 
    WHERE key_hash = $1 
      AND revoked_at IS NULL 
      AND (expires_at IS NULL OR expires_at > NOW())
  `, [incomingHash]).then(res => res[0]);

  if (!project) {
    return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cacheKey, provider, model, payload, ttlSeconds = 86400 } = body;

  if (!cacheKey || !payload) {
    return NextResponse.json({ error: 'Missing required cache fields (cacheKey, payload)' }, { status: 400 });
  }

  // 2. Upsert the cache entry with expires_at
  await db.query(`
    INSERT INTO response_cache (cache_key, project_id, provider, model, response_payload, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 second' * $6)
    ON CONFLICT (cache_key) DO UPDATE SET 
      response_payload = EXCLUDED.response_payload,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
  `, [cacheKey, project.id, provider || null, model || null, JSON.stringify(payload), ttlSeconds]);

  return NextResponse.json({ success: true });
}
