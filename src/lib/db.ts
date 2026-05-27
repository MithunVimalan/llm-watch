// src/lib/db.ts
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmwatch';

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

export const db = {
  async query(text: string, params?: any[]): Promise<any[]> {
    const res = await pool.query(text, params);
    return res.rows;
  },
  pool,
};
