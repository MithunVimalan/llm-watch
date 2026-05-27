// migrate-local.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://neondb_owner:npg_IQlsnt84uJmp@ep-mute-art-apxsoyq5-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

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
