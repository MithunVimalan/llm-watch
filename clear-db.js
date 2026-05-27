// clear-db.js
// Script to clear all simulated/mock telemetry data from your database.
// Run using: node clear-db.js

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
  console.log('Connecting to Neon database...');
  const client = await pool.connect();
  
  try {
    console.log('Purging mock event logs...');
    await client.query('DELETE FROM events;');
    
    console.log('Purging rollup metrics...');
    await client.query('DELETE FROM prompt_hourly_stats;');
    
    console.log('Purging response caches...');
    await client.query('DELETE FROM response_cache;');
    
    console.log('Purging dead letter queue...');
    await client.query('DELETE FROM ingestion_dead_letter;');
    
    console.log('\n✨ Database cleared successfully! Your workspace is now 100% clean and ready for real-time traffic.');
  } catch (err) {
    console.error('Error clearing database:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
