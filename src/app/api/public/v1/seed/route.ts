// src/app/api/public/v1/seed/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const defaultProjId = 'd3b07384-d113-41e9-9c8e-2f77e2ffb288';
  const demoUserId = '11111111-1111-1111-1111-111111111111';

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure project & user are seeded
    await client.query(`
      INSERT INTO projects (id, name)
      VALUES ($1, 'Default Project')
      ON CONFLICT (id) DO NOTHING
    `, [defaultProjId]);

    await client.query(`
      INSERT INTO users (id, email)
      VALUES ($1, 'demo@llmwatch.com')
      ON CONFLICT (id) DO NOTHING
    `, [demoUserId]);

    await client.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `, [defaultProjId, demoUserId]);

    // Ensure API Key exists
    const keyCount = await client.query('SELECT COUNT(*)::int AS count FROM api_keys WHERE project_id = $1', [defaultProjId]).then(res => res.rows[0].count);
    if (keyCount === 0) {
      const defaultSecret = 'demosupersecretkey';
      const rawKey = 'lw_live_' + defaultSecret;
      const displayPrefix = 'lw_live_demo...';
      const nodeCrypto = require('crypto');
      const keyHash = nodeCrypto.createHash('sha256').update(rawKey).digest('hex');
      
      await client.query(`
        INSERT INTO api_keys (project_id, name, prefix, key_hash)
        VALUES ($1, 'Default Sandbox Key', $2, $3)
      `, [defaultProjId, displayPrefix, keyHash]);
    }

    // 2. Clear previous events for seed idempotency
    await client.query('DELETE FROM events WHERE project_id = $1', [defaultProjId]);
    await client.query('DELETE FROM prompt_hourly_stats WHERE project_id = $1', [defaultProjId]);

    // Prompt definitions
    const hashStable = 'hash_stable_prompt_11111';
    const hashLatency = 'hash_latency_regression_22222';
    const hashError = 'hash_error_regression_33333';
    const hashBloat = 'hash_bloat_regression_44444';

    // Seeding events helper
    const seedEvent = async (params: {
      prompt_hash: string;
      provider: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
      latency_ms: number;
      error_message: string | null;
      is_cached: boolean;
      created_hours_ago: number;
      request: any;
      response: any;
    }) => {
      await client.query(`
        INSERT INTO events (
          project_id, idempotency_key, prompt_hash, provider, model, 
          prompt_tokens, completion_tokens, cost_usd, latency_ms, 
          error_message, is_cached, request_payload, response_payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW() - $14 * INTERVAL '1 hour')
      `, [
        defaultProjId,
        `seed_key_${params.prompt_hash}_${params.created_hours_ago}_${Math.random()}`,
        params.prompt_hash,
        params.provider,
        params.model,
        params.prompt_tokens,
        params.completion_tokens,
        params.cost_usd,
        params.latency_ms,
        params.error_message,
        params.is_cached,
        JSON.stringify(params.request),
        JSON.stringify(params.response),
        params.created_hours_ago
      ]);
    };

    // 3. Seed BASELINE Window (24h - 48h ago) - e.g. 30 hours ago
    for (let i = 0; i < 15; i++) {
      const offset = 26 + i;
      
      // Stable prompt
      await seedEvent({
        prompt_hash: hashStable,
        provider: 'openai',
        model: 'gpt-4o',
        prompt_tokens: 80,
        completion_tokens: 40,
        cost_usd: 0.001,
        latency_ms: 320,
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Generate code for sorting.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Here is your quicksort code.' } }] }
      });

      // Latency prompt (was fast, e.g. 210ms)
      await seedEvent({
        prompt_hash: hashLatency,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt_tokens: 150,
        completion_tokens: 60,
        cost_usd: 0.0001,
        latency_ms: 210,
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Summarize text quickly.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Summary contents.' } }] }
      });

      // Error prompt (was 100% successful)
      await seedEvent({
        prompt_hash: hashError,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20240620',
        prompt_tokens: 120,
        completion_tokens: 90,
        cost_usd: 0.002,
        latency_ms: 600,
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Query user database details.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Database records formatted.' } }] }
      });

      // Bloat prompt (was small size, 50 tokens)
      await seedEvent({
        prompt_hash: hashBloat,
        provider: 'google',
        model: 'gemini-1.5-flash',
        prompt_tokens: 50,
        completion_tokens: 30,
        cost_usd: 0.00005,
        latency_ms: 180,
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Format text input.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Formatted text.' } }] }
      });
    }

    // 4. Seed CURRENT Window (0h - 24h ago) - e.g. 2 to 18 hours ago
    for (let i = 0; i < 15; i++) {
      const offset = 2 + (i % 16);

      // Stable prompt (remains stable: 340ms, success)
      await seedEvent({
        prompt_hash: hashStable,
        provider: 'openai',
        model: 'gpt-4o',
        prompt_tokens: 82,
        completion_tokens: 38,
        cost_usd: 0.00098,
        latency_ms: 340,
        error_message: null,
        is_cached: i % 3 === 0, // Seed some cached hits!
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Generate code for sorting.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Here is your quicksort code.' } }] }
      });

      // Latency regression prompt (spiked from 210ms to 920ms!)
      await seedEvent({
        prompt_hash: hashLatency,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt_tokens: 150,
        completion_tokens: 65,
        cost_usd: 0.00012,
        latency_ms: 920, // Latency Spike!
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Summarize text quickly.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Summary contents.' } }] }
      });

      // Error regression prompt (half of them fail now with API timeout errors!)
      const triggerError = i % 2 === 0;
      await seedEvent({
        prompt_hash: hashError,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20240620',
        prompt_tokens: 120,
        completion_tokens: triggerError ? 0 : 88,
        cost_usd: triggerError ? 0.00036 : 0.0019,
        latency_ms: triggerError ? 1200 : 580,
        error_message: triggerError ? 'API Connection timeout: anthropic gateway unreachable' : null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Query user database details.' }] },
        response: triggerError ? null : { choices: [{ message: { role: 'assistant', content: 'Database records formatted.' } }] }
      });

      // Token bloat prompt (tokens grew from 50 to 300!)
      await seedEvent({
        prompt_hash: hashBloat,
        provider: 'google',
        model: 'gemini-1.5-flash',
        prompt_tokens: 300, // Token Bloat!
        completion_tokens: 45,
        cost_usd: 0.00015,
        latency_ms: 220,
        error_message: null,
        is_cached: false,
        created_hours_ago: offset,
        request: { messages: [{ role: 'user', content: 'Format text input with a massive inline configuration block and recursive context injection.' }] },
        response: { choices: [{ message: { role: 'assistant', content: 'Formatted text.' } }] }
      });
    }

    await client.query('COMMIT');
    return NextResponse.json({ 
      success: true, 
      message: 'Database seeded with baseline and current events for regressions testing.',
      projectId: defaultProjId
    });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('Seeder failed:', e);
    return NextResponse.json({ success: false, error: e.message || 'Seeder failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
