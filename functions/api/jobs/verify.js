/**
 * GET /api/jobs/verify?token=<64-char-hex>
 * Verifies subscriber email and redirects to the tool page.
 * Browser navigation endpoint — no CORS headers needed.
 */

import { corsOptions } from '../../lib/cors.js';

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const TOOL_URL = '/tools/job-alerts/';
const VERIFY_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || !TOKEN_RE.test(token)) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  const row = await env.DB.prepare(
    'SELECT id, verified, created_at FROM subscribers WHERE verify_token = ? LIMIT 1'
  ).bind(token).first();

  if (!row) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  if (row.verified === 1) {
    return Response.redirect(`${TOOL_URL}?verified=already`, 302);
  }

  const now = Math.floor(Date.now() / 1000);

  if (now - row.created_at > VERIFY_EXPIRY) {
    return Response.redirect(`${TOOL_URL}?verified=error`, 302);
  }

  await env.DB.prepare(
    'UPDATE subscribers SET verified = 1, verified_at = ? WHERE id = ?'
  ).bind(now, row.id).run();

  return Response.redirect(`${TOOL_URL}?verified=1`, 302);
}

export { corsOptions as onRequestOptions };
