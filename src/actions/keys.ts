// src/actions/keys.ts
'use server';

import { db } from '@/lib/db';
import { generateApiKey } from '@/lib/crypto';
import { withProjectAccess } from '@/lib/auth';

export async function rollApiKey(projectId: string, existingKeyId: string) {
  return await withProjectAccess(projectId, 'admin', async () => {
    const newKey = generateApiKey('live');
    
    // Connect to checkout a pool client to run actual multi-query transactions safely
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Insert new replacement key
      await client.query(`
        INSERT INTO api_keys (project_id, name, prefix, key_hash) 
        VALUES ($1, $2, $3, $4)
      `, [projectId, 'Rolled Key', newKey.prefix, newKey.keyHash]);
      
      // 2. Set the old key to expire in 24 hours (zero-downtime window)
      await client.query(`
        UPDATE api_keys 
        SET expires_at = NOW() + INTERVAL '24 hours' 
        WHERE id = $1 AND project_id = $2
      `, [existingKeyId, projectId]);
      
      await client.query('COMMIT');
      
      // Return raw key once to the client
      return { success: true, plainTextKey: newKey.rawKey };
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw new Error('Failed to roll API key: ' + e.message);
    } finally {
      client.release();
    }
  });
}

export async function createApiKey(projectId: string, name: string) {
  return await withProjectAccess(projectId, 'admin', async () => {
    const newKey = generateApiKey('live');
    await db.query(`
      INSERT INTO api_keys (project_id, name, prefix, key_hash)
      VALUES ($1, $2, $3, $4)
    `, [projectId, name || 'New Key', newKey.prefix, newKey.keyHash]);
    
    return { success: true, plainTextKey: newKey.rawKey };
  });
}

export async function revokeApiKey(projectId: string, keyId: string) {
  return await withProjectAccess(projectId, 'admin', async () => {
    await db.query(`
      UPDATE api_keys 
      SET revoked_at = NOW() 
      WHERE id = $1 AND project_id = $2
    `, [keyId, projectId]);
    
    return { success: true };
  });
}

export async function getApiKeys(projectId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    return await db.query(`
      SELECT id, name, prefix, created_at, expires_at, revoked_at
      FROM api_keys
      WHERE project_id = $1
      ORDER BY created_at DESC
    `, [projectId]);
  });
}
