// migrate-drop-fk.js
const { Pool } = require('pg');

const connectionString = "postgresql://neondb_owner:npg_IQlsnt84uJmp@ep-mute-art-apxsoyq5-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

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
