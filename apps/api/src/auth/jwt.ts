import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || 'coretrack-dev-jwt-secret-change-in-production';
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

export function signAuthToken(
  user: { sub: string; email: string },
  expiresInSeconds = 7 * 24 * 60 * 60
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.sub,
      email: user.email,
      iat: now,
      exp: now + expiresInSeconds,
    } satisfies AuthTokenPayload)
  );
  const data = `${header}.${payload}`;
  const sig = base64UrlEncode(createHmac('sha256', getJwtSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const data = `${header}.${payload}`;
    const expectedSig = base64UrlEncode(createHmac('sha256', getJwtSecret()).update(data).digest());

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(base64UrlDecode(payload).toString('utf8')) as AuthTokenPayload;
    if (!decoded.sub || !decoded.email) return null;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return decoded;
  } catch {
    return null;
  }
}
