/**
 * KV-based fixed-window rate limiter (per-IP, per-endpoint, 60 s default window).
 *
 * Requires a KV namespace bound as RATE_LIMIT in wrangler.toml.
 * Gracefully degrades to a no-op when the binding is absent (local dev).
 *
 * Usage:
 *   const limited = await enforceRateLimit(context.env, 'dns', ip);
 *   if (limited) return limited;
 */

import { cors } from './cors.js';

// [maxRequests, windowSeconds]
const LIMITS = {
  dns:       [20, 60],
  link:      [10, 60],
  chain:     [5,  60],
  osint:     [5,  60],
  leak:      [30, 60],
};

export async function enforceRateLimit(env, endpoint, ip) {
  if (!env.RATE_LIMIT) return null;

  const [max, ttl] = LIMITS[endpoint] ?? [30, 60];
  const key = `${endpoint}:${ip}`;

  const current = await env.RATE_LIMIT.get(key);
  if (current === null) {
    await env.RATE_LIMIT.put(key, '1', { expirationTtl: ttl });
    return null;
  }
  const count = parseInt(current, 10);
  if (count >= max) {
    return cors({ error: 'Too many requests. Please wait before trying again.' }, 429);
  }
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: ttl });
  return null;
}
