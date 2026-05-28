// test-query-all-today.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^DATABASE_URL\s*=\s*["']?(.*?)["']?$/m);
    if (match && match[1]) return match[1].trim();
  }
  throw new Error('DATABASE_URL is not set in environment or .env.local');
}

const connectionString = getConnectionString();

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Querying all events from today...');
    const res = await client.query(`
      SELECT id, trace_id, span_name, span_type, cost_usd, model, prompt_tokens, completion_tokens, created_at 
      FROM events 
      WHERE created_at > '2026-05-28 00:00:00Z'
      ORDER BY created_at DESC
    `);
    console.log(`Total events found: ${res.rows.length}`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
