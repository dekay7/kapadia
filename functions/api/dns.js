/**
 * GET /api/dns?domain=example.com
 * Fetches common DNS records using Cloudflare's DoH API.
 */

import { cors, corsOptions } from '../lib/cors.js';
import { enforceRateLimit } from '../lib/rate-limit.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await enforceRateLimit(env, 'dns', ip);
  if (limited) return limited;

  const url = new URL(request.url);
  const rawDomain = url.searchParams.get('domain');

  if (!rawDomain) {
    return cors({ error: 'Missing domain parameter' }, 400);
  }

  // Normalise: strip protocol and path (tolerant of user pasting a full URL)
  const domain = rawDomain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().trim();

  // Validate: must look like a real domain (matches the guard in /api/osint)
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
    return cors({ error: 'Invalid domain format' }, 400);
  }

  const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'];
  const results = {};

  const settled = await Promise.allSettled(types.map(async (type) => {
    const fetchUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
    const res = await fetch(fetchUrl, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { type, records: [] };
    const data = await res.json();
    if (!data.Answer) return { type, records: [] };
    return {
      type,
      records: data.Answer.map(ans => ({ name: ans.name, ttl: ans.TTL, data: ans.data })),
    };
  }));

  settled.forEach((result, i) => {
    results[types[i]] = result.status === 'fulfilled' ? result.value.records : [];
  });

  return cors(results);
}

export { corsOptions as onRequestOptions };
