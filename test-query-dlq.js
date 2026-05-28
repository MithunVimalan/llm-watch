// test-query-dlq.js
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
    console.log('Querying DLQ...');
    const res = await client.query(`
      SELECT id, project_id, raw_payload, error_reason, created_at 
      FROM ingestion_dead_letter 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
