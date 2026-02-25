import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../config';
import type { Database } from 'bun:sqlite';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'platform' | 'app';
  appName?: string;
}

export async function createToken(
  payload: JwtPayload,
  config: Config,
  expiresIn = '24h',
): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(
  token: string,
  config: Config,
): Promise<JwtPayload> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}

export function hashApiKey(key: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(key);
  return hasher.digest('hex');
}

export function verifyApiKey(
  key: string,
  platformDb: Database,
): { appName: string; role: string } | null {
  const keyHash = hashApiKey(key);
  const row = platformDb
    .query(
      `SELECT app_name, role, expires_at FROM api_keys WHERE key_hash = ?`,
    )
    .get(keyHash) as { app_name: string; role: string; expires_at: string | null } | null;

  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  return { appName: row.app_name, role: row.role };
}
