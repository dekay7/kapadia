/**
 * GET /api/jobs/unsubscribe-all?token=<64-char-hex>
 * Removes all subscriptions for an email address by global_unsub_token and redirects.
 * Browser navigation endpoint — no CORS headers needed.
 */

import { corsOptions } from '../../lib/cors.js';

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const TOOL_URL = 'https://kapadia.org/tools/job-alerts/';

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = new URL(request.url).searchParams.get('token');

  if (!token || !TOKEN_RE.test(token)) {
    return Response.redirect(`${TOOL_URL}?unsubscribed=error`, 302);
  }

  await env.DB.prepare(
    'DELETE FROM subscribers WHERE global_unsub_token = ?'
  ).bind(token).run();

  return Response.redirect(`${TOOL_URL}?unsubscribed=all`, 302);
}

export { corsOptions as onRequestOptions };
