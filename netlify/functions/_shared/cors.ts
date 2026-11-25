const PRIMARY_ORIGIN = 'https://parismetro3d.com';
const LEGACY_NETLIFY_ORIGIN = 'https://parisian3dsubway.netlify.app';

function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([
    PRIMARY_ORIGIN,
    'https://www.parismetro3d.com',
    LEGACY_NETLIFY_ORIGIN,
  ]);

  if (process.env.ALLOWED_ORIGIN) {
    for (const entry of process.env.ALLOWED_ORIGIN.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }
  if (process.env.URL) allowed.add(process.env.URL.trim());
  if (process.env.DEPLOY_PRIME_URL) allowed.add(process.env.DEPLOY_PRIME_URL.trim());
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL.trim()}`);
  if (process.env.VERCEL_BRANCH_URL) allowed.add(`https://${process.env.VERCEL_BRANCH_URL.trim()}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowed.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`);
  }

  if (process.env.NODE_ENV !== 'production' || process.env.NETLIFY_DEV === 'true') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://localhost:8888');
  }

  return allowed;
}

export function getAllowedCorsOrigin(event?: {
  headers?: Record<string, string | undefined>;
}): string {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin;
  const allowed = getAllowedOrigins();
  if (reqOrigin && allowed.has(reqOrigin)) {
    return reqOrigin;
  }
  return process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || PRIMARY_ORIGIN;
}

export function getCorsHeaders(
  event?: { headers?: Record<string, string | undefined> },
  methods = 'GET, OPTIONS'
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedCorsOrigin(event),
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  event?: { headers?: Record<string, string | undefined> },
  maxRequests = 60,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec?: number } {
  const headers = event?.headers;
  if (!headers) return { allowed: true };

  const rawIp =
    headers['x-nf-client-connection-ip'] ||
    headers['X-Nf-Client-Connection-Ip'] ||
    headers['x-forwarded-for'] ||
    headers['X-Forwarded-For'];
  if (!rawIp) return { allowed: true };

  const ip = rawIp.split(',')[0].trim();
  if (!ip) return { allowed: true };

  const now = Date.now();
  if (ipBuckets.size > 1000) {
    for (const [key, bucket] of ipBuckets) {
      if (now >= bucket.resetAt) ipBuckets.delete(key);
    }
  }

  const existing = ipBuckets.get(ip);
  if (!existing || now >= existing.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

export function rateLimitedResponse(
  event?: { headers?: Record<string, string | undefined> },
  retryAfterSec = 60
) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfterSec),
      ...getCorsHeaders(event),
    },
    body: JSON.stringify({
      error: 'Too many requests',
      retryAfterSec,
    }),
  };
}
