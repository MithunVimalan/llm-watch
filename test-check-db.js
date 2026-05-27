// test-check-db.js
const { Pool } = require('pg');

const connectionString = "postgresql://neondb_owner:npg_IQlsnt84uJmp@ep-mute-art-apxsoyq5-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

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
