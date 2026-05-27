// migrate-drop-fk.js
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
  console.log('Dropping strict parent_span_id foreign key constraint to support async out-of-order span ingestion...');
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_parent_span_id_fkey;
    `);
    console.log('Foreign key constraint dropped successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
