/**
 * GET /api/jobs/verify?token=<64-char-hex>
 * Verifies subscriber email and redirects to the tool page.
 * Browser navigation endpoint — no CORS headers needed.
 */

import { corsOptions } from '../../lib/cors.js';
import { VERIFY_EXPIRY_SECONDS } from '../../lib/limits.js';

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const TOOL_URL = 'https://kapadia.org/tools/job-alerts/';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || !TOKEN_RE.test(token)) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  const { results: rows } = await env.DB.prepare(
    'SELECT verified, created_at FROM subscribers WHERE verify_token = ?'
  ).bind(token).all();

  if (rows.length === 0) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  if (rows.every(r => r.verified === 1)) {
    return Response.redirect(`${TOOL_URL}?verified=already`, 302);
  }

  const now = Math.floor(Date.now() / 1000);

  if (now - rows[0].created_at > VERIFY_EXPIRY_SECONDS) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  await env.DB.prepare(
    'UPDATE subscribers SET verified = 1, verified_at = ? WHERE verify_token = ? AND verified = 0'
  ).bind(now, token).run();

  return Response.redirect(`${TOOL_URL}?verified=1`, 302);
}

export { corsOptions as onRequestOptions };
