// test-check-project.js
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
    console.log('Querying projects...');
    const res = await client.query(`
      SELECT id, name, monthly_events_limit, monthly_events_count, billing_cycle_start, last_used_at 
      FROM projects
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
