import { cors, corsOptions } from '../lib/cors.js';
import { enforceRateLimit } from '../lib/rate-limit.js';

/**
 * GET /api/leak
 * Dumps HTTP request headers and Cloudflare TLS connection properties.
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await enforceRateLimit(env, 'leak', ip);
  if (limited) return limited;

  const HIDDEN = new Set([
    'cf-access-jwt-assertion', 'cf-access-token',
    'authorization', 'cookie',
  ]);
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    if (!HIDDEN.has(key)) headers[key] = value;
  }

  const cf = request.cf || {};

  const payload = {
    httpProtocol: cf.httpProtocol || 'HTTP/1.1',
    tlsCipher: cf.tlsCipher || null,
    tlsVersion: cf.tlsVersion || null,
    clientTcpRtt: cf.clientTcpRtt || null,
    headers: headers,
    ip: request.headers.get('cf-connecting-ip') || null,
    colo: cf.colo || null,
  };

  return cors(payload);
}

export { corsOptions as onRequestOptions };
