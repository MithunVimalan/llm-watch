// src/app/api/public/v1/events/route.ts
import { NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { hashIncomingKey } from '@/lib/crypto';
import { randomUUID } from 'crypto';
import { scanTracesForAnomalies } from '@/lib/anomalies-scanner';

// In-memory cache for models pricing catalog (5-min TTL)
let pricingCache: Record<string, { prompt: number; completion: number }> | null = null;
let pricingCacheExpiry = 0;

async function getPricing(provider: string, model: string) {
  const now = Date.now();
  if (now > pricingCacheExpiry || !pricingCache) {
    const catalog = await db.query(
      'SELECT provider, model_name, cost_per_1k_prompt_tokens, cost_per_1k_completion_tokens FROM models_catalog'
    );
    pricingCache = {};
    for (const row of catalog) {
      const key = `${row.provider.toLowerCase()}:${row.model_name.toLowerCase()}`;
      pricingCache[key] = {
        prompt: Number(row.cost_per_1k_prompt_tokens),
        completion: Number(row.cost_per_1k_completion_tokens)
      };
    }
    pricingCacheExpiry = now + 5 * 60 * 1000;
  }
  
  const provLower = provider?.toLowerCase() || '';
  const modelLower = model?.toLowerCase() || '';

  // 1. Exact match
  if (pricingCache[`${provLower}:${modelLower}`]) {
    return pricingCache[`${provLower}:${modelLower}`];
  }
  // 2. Wildcard fallback (e.g. provider:provider/*)
  if (pricingCache[`${provLower}:${provLower}/*`]) {
    return pricingCache[`${provLower}:${provLower}/*`];
  }
  // 3. Fallback to zero
  return { prompt: 0, completion: 0 };
}

export async function POST(req: Request) {
  const sourceIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
  const authHeader = req.headers.get('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '').trim();
  
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 401 });
  }

  // 1. Authenticate API Key by Hash
  const incomingHash = hashIncomingKey(apiKey);
  const project = await db.query(`
    SELECT 
      k.project_id AS id, 
      p.monthly_events_limit, 
      p.monthly_events_count, 
      p.billing_cycle_start
    FROM api_keys k
    JOIN projects p ON k.project_id = p.id
    WHERE k.key_hash = $1 
      AND k.revoked_at IS NULL 
      AND (k.expires_at IS NULL OR k.expires_at > NOW())
  `, [incomingHash]).then(res => res[0]);

  if (!project) {
    return NextResponse.json({ error: 'Invalid or Expired API Key' }, { status: 401 });
  }

  // 2. Billing Cycle Reset check
  let currentUsage = Number(project.monthly_events_count || 0);
  const limit = Number(project.monthly_events_limit ?? 50000);
  const cycleStart = new Date(project.billing_cycle_start || Date.now());

  if (Date.now() - cycleStart.getTime() >= 30 * 24 * 60 * 60 * 1000) {
    try {
      await db.query(`
        UPDATE projects 
        SET monthly_events_count = 0, billing_cycle_start = NOW() 
        WHERE id = $1
      `, [project.id]);
      currentUsage = 0;
    } catch (err) {
      console.error('Failed to reset billing cycle:', err);
    }
  }

  // 3. Quota Limits check
  if (currentUsage >= limit) {
    return NextResponse.json({ 
      error: 'Monthly event limit exceeded. Please upgrade your subscription.' 
    }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = Array.isArray(body) ? body : [body];
  if (events.length === 0 || events.length > 500) {
    return NextResponse.json({ error: 'Batch must contain 1-500 events' }, { status: 400 });
  }

  // 4. Basic Event Validation (Check required properties)
  const validEvents: any[] = [];
  const invalidEvents: any[] = [];

  for (const event of events) {
    if (!event.provider || !event.model || !event.idempotency_key) {
      invalidEvents.push({
        event,
        error: 'Missing required fields: provider, model, or idempotency_key'
      });
    } else {
      validEvents.push(event);
    }
  }

  if (validEvents.length === 0) {
    // If we have some events, but all of them are invalid
    // we can write them in background and respond 400 immediately
    after(async () => {
      for (const invalid of invalidEvents) {
        try {
          await db.query(`
            INSERT INTO ingestion_dead_letter (project_id, raw_payload, error_reason, source_ip)
            VALUES ($1, $2, $3, $4)
          `, [
            project.id, 
            JSON.stringify(invalid.event), 
            invalid.error, 
            sourceIp
          ]);
        } catch (dlqErr) {
          console.error('Failed to write invalid event to DLQ:', dlqErr);
        }
      }
    });

    return NextResponse.json({ 
      error: 'No valid events found in batch. Required fields: provider, model, idempotency_key' 
    }, { status: 400 });
  }

  // 5. Decoupled Processing inside after
  const acceptedCount = validEvents.length;

  after(async () => {
    // Increment monthly usage count in the database
    try {
      await db.query(`
        UPDATE projects 
        SET monthly_events_count = monthly_events_count + $1, last_used_at = NOW()
        WHERE id = $2
      `, [acceptedCount, project.id]);
    } catch (err) {
      console.error('Failed to update monthly usage count:', err);
    }

    // Write invalid events to DLQ
    for (const invalid of invalidEvents) {
      try {
        await db.query(`
          INSERT INTO ingestion_dead_letter (project_id, raw_payload, error_reason, source_ip)
          VALUES ($1, $2, $3, $4)
        `, [
          project.id, 
          JSON.stringify(invalid.event), 
          invalid.error, 
          sourceIp
        ]);
      } catch (dlqErr) {
        console.error('Failed to log invalid event to DLQ:', dlqErr);
      }
    }

    // Prepare batch insertion values
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const event of validEvents) {
      try {
        let costUsd = event.cost_usd;
        if (typeof costUsd !== 'number') {
          const rates = await getPricing(event.provider, event.model);
          costUsd = ((event.prompt_tokens || 0) * rates.prompt / 1000) + 
                    ((event.completion_tokens || 0) * rates.completion / 1000);
        }

        // Use idempotency_key as the primary key id if it's a valid UUID, otherwise generate one
        const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.idempotency_key);
        const eventId = isValidUuid ? event.idempotency_key : randomUUID();

        values.push(
          eventId,
          project.id,
          event.idempotency_key,
          event.request_id || null,
          event.prompt_hash || null,
          event.customer_identifier || null,
          event.provider,
          event.model,
          event.prompt_tokens || 0,
          event.completion_tokens || 0,
          costUsd,
          event.latency_ms || null,
          event.error_message || null,
          event.is_cached || false,
          event.request_payload ? JSON.stringify(event.request_payload) : null,
          event.response_payload ? JSON.stringify(event.response_payload) : null,
          event.trace_id || null,
          event.parent_span_id || null,
          event.span_type || 'llm',
          event.span_name || null,
          event.execution_order || 0,
          event.state_snapshot ? JSON.stringify(event.state_snapshot) : null,
          event.reasoning_text || null,
          event.duration_breakdown ? JSON.stringify(event.duration_breakdown) : null,
          event.token_breakdown ? JSON.stringify(event.token_breakdown) : null,
          event.context_window_used || null,
          event.context_window_max || null
        );

        const rowPlaceholders = [];
        for (let j = 0; j < 27; j++) {
          rowPlaceholders.push(`$${paramIndex++}`);
        }
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
      } catch (err: any) {
        try {
          await db.query(`
            INSERT INTO ingestion_dead_letter (project_id, raw_payload, error_reason, source_ip)
            VALUES ($1, $2, $3, $4)
          `, [
            project.id, 
            JSON.stringify(event), 
            err.message || 'Pricing / payload conversion error', 
            sourceIp
          ]);
        } catch (dlqErr) {
          console.error('Failed to log invalid event to DLQ:', dlqErr);
        }
      }
    }

    if (placeholders.length === 0) return;

    // Run dynamic multi-row batch insert (including primary key id column)
    const query = `
      INSERT INTO events (
        id, project_id, idempotency_key, request_id, prompt_hash, customer_identifier, 
        provider, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, 
        error_message, is_cached, request_payload, response_payload,
        trace_id, parent_span_id, span_type, span_name,
        execution_order, state_snapshot, reasoning_text, duration_breakdown,
        token_breakdown, context_window_used, context_window_max
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id;
    `;

    try {
      await db.query(query, values);
    } catch (batchErr: any) {
      console.warn('Batch insertion failed, falling back to row-by-row insertion:', batchErr.message);
      
      // Fallback row-by-row mode
      for (const event of validEvents) {
        try {
          let costUsd = event.cost_usd;
          if (typeof costUsd !== 'number') {
            const rates = await getPricing(event.provider, event.model);
            costUsd = ((event.prompt_tokens || 0) * rates.prompt / 1000) + 
                      ((event.completion_tokens || 0) * rates.completion / 1000);
          }

          const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.idempotency_key);
          const eventId = isValidUuid ? event.idempotency_key : randomUUID();

          await db.query(`
            INSERT INTO events (
              id, project_id, idempotency_key, request_id, prompt_hash, customer_identifier, 
              provider, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, 
              error_message, is_cached, request_payload, response_payload,
              trace_id, parent_span_id, span_type, span_name,
              execution_order, state_snapshot, reasoning_text, duration_breakdown,
              token_breakdown, context_window_used, context_window_max
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
            ON CONFLICT (project_id, idempotency_key) DO NOTHING;
          `, [
            eventId,
            project.id,
            event.idempotency_key,
            event.request_id || null,
            event.prompt_hash || null,
            event.customer_identifier || null,
            event.provider,
            event.model,
            event.prompt_tokens || 0,
            event.completion_tokens || 0,
            costUsd,
            event.latency_ms || null,
            event.error_message || null,
            event.is_cached || false,
            event.request_payload ? JSON.stringify(event.request_payload) : null,
            event.response_payload ? JSON.stringify(event.response_payload) : null,
            event.trace_id || null,
            event.parent_span_id || null,
            event.span_type || 'llm',
            event.span_name || null,
            event.execution_order || 0,
            event.state_snapshot ? JSON.stringify(event.state_snapshot) : null,
            event.reasoning_text || null,
            event.duration_breakdown ? JSON.stringify(event.duration_breakdown) : null,
            event.token_breakdown ? JSON.stringify(event.token_breakdown) : null,
            event.context_window_used || null,
            event.context_window_max || null
          ]);
        } catch (dbError: any) {
          try {
            await db.query(`
              INSERT INTO ingestion_dead_letter (project_id, raw_payload, error_reason, source_ip)
              VALUES ($1, $2, $3, $4)
            `, [
              project.id, 
              JSON.stringify(event), 
              dbError.message || 'Row-by-row insertion failed', 
              sourceIp
            ]);
          } catch (dlqErr) {
            console.error('Fatal: Failed to write to DLQ during fallback', dlqErr);
          }
        }
      }
    }

    // Run real-time anomaly scanning on all processed traces
    const uniqueTraceIds = Array.from(
      new Set(validEvents.map(e => e.trace_id).filter(Boolean))
    ) as string[];

    if (uniqueTraceIds.length > 0) {
      try {
        await scanTracesForAnomalies(project.id, uniqueTraceIds);
      } catch (scanErr) {
        console.error('Failed to run real-time anomaly scan:', scanErr);
      }
    }
  });

  // Return 202 Accepted immediately
  return NextResponse.json({ 
    accepted: acceptedCount, 
    queued: true,
    rejected: invalidEvents.length
  }, { status: 202 });
}
