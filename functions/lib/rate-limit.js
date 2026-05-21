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
  subscribe: [5,  3600],
};

export async function enforceRateLimit(env, endpoint, ip) {
  if (!env.RATE_LIMIT) return null;

  const [max, ttl] = LIMITS[endpoint] ?? [30, 60];
  const key = `${endpoint}:${ip}`;
  const now = Math.floor(Date.now() / 1000);

  const raw = await env.RATE_LIMIT.get(key);

  // Parse stored {count, until} or treat as a fresh window if absent/stale/old-format.
  let parsed = null;
  if (raw !== null) {
    try {
      const obj = JSON.parse(raw);
      if (typeof obj?.count === 'number' && typeof obj?.until === 'number') parsed = obj;
    } catch { /* old plain-number format — start a fresh window */ }
  }

  if (!parsed || now > parsed.until) {
    // First request in a new window
    await env.RATE_LIMIT.put(key, JSON.stringify({ count: 1, until: now + ttl }), { expirationTtl: ttl });
    return null;
  }

  if (parsed.count >= max) {
    return cors({ error: 'Too many requests. Please wait before trying again.' }, 429);
  }

  // Increment count; preserve the original window expiry so the window stays fixed.
  const remaining = Math.max(1, parsed.until - now);
  await env.RATE_LIMIT.put(
    key,
    JSON.stringify({ count: parsed.count + 1, until: parsed.until }),
    { expirationTtl: remaining },
  );
  return null;
}
