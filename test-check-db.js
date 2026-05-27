// test-check-db.js
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
    console.log('Querying latest 10 events in database...');
    const res = await client.query(`
      SELECT 
        id, 
        span_name, 
        span_type, 
        trace_id, 
        parent_span_id, 
        latency_ms,
        cost_usd,
        error_message,
        created_at
      FROM events 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.table(res.rows);
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
