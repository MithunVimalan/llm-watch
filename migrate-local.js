// migrate-local.js
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
  connectionTimeoutMillis: 5000
});

async function run() {
  console.log('Connecting to Neon database and running migrations...');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(schemaSql);
    console.log('Migrations executed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
