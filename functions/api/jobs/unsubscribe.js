/**
 * GET /api/jobs/unsubscribe?token=<64-char-hex>
 * Removes subscriber by unsub token and redirects to the tool page.
 * Browser navigation endpoint — no CORS headers needed.
 */

import { corsOptions } from '../../lib/cors.js';

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const TOOL_URL = 'https://kapadia.org/tools/job-alerts/';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || !TOKEN_RE.test(token)) {
    return Response.redirect(`${TOOL_URL}?unsubscribed=error`, 302);
  }

  await env.DB.prepare(
    'DELETE FROM subscribers WHERE unsub_token = ?'
  ).bind(token).run();

  return Response.redirect(`${TOOL_URL}?unsubscribed=1`, 302);
}

export { corsOptions as onRequestOptions };
