// src/lib/crypto.ts
import { randomBytes, createHash } from 'crypto';

export interface GeneratedKey {
  rawKey: string;     // Show to user exactly once, never store.
  prefix: string;     // Save in database to identify key visually in UI.
  keyHash: string;    // SHA-256 hash stored in database.
}

export function generateApiKey(environment: 'test' | 'live' = 'live'): GeneratedKey {
  // Generate 32 bytes of secure random bytes and encode as base64url
  const secret = randomBytes(32).toString('base64url');
  
  // Prefix configuration
  const prefixStr = `lw_${environment}_`;
  const rawKey = `${prefixStr}${secret}`;
  
  // UI prefix representation showing only first 4 characters of secret
  const displayPrefix = `${prefixStr}${secret.slice(0, 4)}...`;
  
  // SHA-256 hashing
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  
  return { rawKey, prefix: displayPrefix, keyHash };
}

export function hashIncomingKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}
