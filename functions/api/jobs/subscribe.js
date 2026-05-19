/**
 * POST /api/jobs/subscribe
 * Body: { email, subscriptions: [{ category, listing_type }, ...] }
 * Upserts all requested subscriptions and sends one consolidated verification email.
 *
 * The cap check is embedded in the INSERT itself (INSERT INTO ... SELECT ... WHERE ...)
 * so the count query and the write are atomic at the SQLite level, eliminating TOCTOU races.
 */

import { cors, corsPostOptions } from '../../lib/cors.js';
import { enforceRateLimit } from '../../lib/rate-limit.js';
import { MAX_SUBSCRIBERS, EMAIL_MAX_LENGTH, RESEND_TIMEOUT_MS } from '../../lib/limits.js';

const VALID_CATEGORIES = new Set(['cybersecurity', 'it']);
const VALID_TYPES      = new Set(['internship', 'newgrad']);
const EMAIL_RE         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CYCLE_YEAR       = 2026;
const RESEND_API       = 'https://api.resend.com/emails';
const FROM_EMAIL       = 'Job Alerts <alerts@kapadia.org>';
const SITE             = 'https://kapadia.org';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await enforceRateLimit(env, 'subscribe', ip);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return cors({ error: 'Invalid JSON body.' }, 400);
  }

  const { email, subscriptions } = body ?? {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > EMAIL_MAX_LENGTH) {
    return cors({ error: 'Invalid email address.' }, 400);
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0 || subscriptions.length > 4) {
    return cors({ error: 'subscriptions must be an array of 1–4 entries.' }, 400);
  }

  for (const sub of subscriptions) {
    if (!VALID_CATEGORIES.has(sub?.category)) {
      return cors({ error: `Invalid category: ${sub?.category}` }, 400);
    }
    if (!VALID_TYPES.has(sub?.listing_type)) {
      return cors({ error: `Invalid listing_type: ${sub?.listing_type}` }, 400);
    }
  }

  const now = Math.floor(Date.now() / 1000);

  // Reuse an existing global_unsub_token if this email already has subscriptions,
  // so all rows for the same address always share one "unsubscribe from all" token.
  const existingRow = await env.DB.prepare(
    'SELECT global_unsub_token FROM subscribers WHERE email = ? AND global_unsub_token IS NOT NULL LIMIT 1'
  ).bind(email).first();
  const globalUnsubToken = existingRow?.global_unsub_token ?? randomHex();

  // One shared verify token for the entire batch so a single link verifies all subscriptions.
  const verifyToken = randomHex();

  // Run one conditional INSERT per subscription. The WHERE clause embeds the cap check:
  //   - If this email already has any row in subscribers → EXISTS is true → always allowed
  //     (they're already in the distinct count, so no new slot is consumed).
  //   - If this is a new email → only allowed if distinct count is below MAX_SUBSCRIBERS.
  // Because D1/SQLite serializes concurrent writes, this is race-free.
  const stmts = subscriptions.map(({ category, listing_type }) => {
    const unsubToken = randomHex();
    return env.DB.prepare(
      `INSERT INTO subscribers (email, category, listing_type, verified, verify_token, unsub_token, global_unsub_token, created_at)
       SELECT ?, ?, ?, 0, ?, ?, ?, ?
       WHERE (
         EXISTS (SELECT 1 FROM subscribers WHERE email = ?)
         OR (SELECT COUNT(DISTINCT email) FROM subscribers) < ?
       )
       ON CONFLICT(email, category, listing_type) DO UPDATE SET
         verify_token       = excluded.verify_token,
         unsub_token        = excluded.unsub_token,
         global_unsub_token = excluded.global_unsub_token,
         verified           = 0,
         created_at         = excluded.created_at
       WHERE subscribers.verified = 0`
    ).bind(email, category, listing_type, verifyToken, unsubToken, globalUnsubToken, now, email, MAX_SUBSCRIBERS);
  });

  const results = await env.DB.batch(stmts);

  const changed = results
    .map((r, i) => ({ result: r, sub: subscriptions[i] }))
    .filter(({ result }) => result.meta.changes > 0);

  if (changed.length === 0) {
    // Distinguish "all already verified" from "cap exceeded for a brand-new email".
    const existing = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM subscribers WHERE email = ?'
    ).bind(email).first();

    if (existing.cnt === 0) {
      return cors({ error: 'Subscription list is currently full. Please try again later.' }, 503);
    }
    return cors({ ok: true, already: true });
  }

  const verifyUrl = `${SITE}/api/jobs/verify?token=${verifyToken}`;

  const subscriptionLabels = changed.map(({ sub: { category, listing_type } }) => ({
    catLabel:  category === 'cybersecurity' ? 'Cybersecurity' : 'IT',
    typeLabel: listing_type === 'internship' ? `Internship ${CYCLE_YEAR}` : `New Grad ${CYCLE_YEAR}`,
  }));

  const emailHtml = buildVerificationEmail(verifyUrl, subscriptionLabels);

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [email],
      subject: 'Verify your job alerts on kapadia.org',
      html:    emailHtml,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.error('Resend error:', res.status);
    return cors({ error: 'Failed to send verification email. Please try again.' }, 502);
  }

  return cors({ ok: true });
}

function randomHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildVerificationEmail(verifyUrl, subscriptionLabels) {
  const labelList = subscriptionLabels.map(({ catLabel, typeLabel }) => `
    <li style="color:#a8a59e;font-size:14px;margin-bottom:4px;">
      <strong style="color:#e6e3dc;">${esc(catLabel)} ${esc(typeLabel)}</strong> alerts
    </li>`).join('');

  const plural = subscriptionLabels.length > 1;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Verify your job alerts</title></head>
<body style="background:#111110;color:#e6e3dc;font-family:'DM Sans',system-ui,sans-serif;margin:0;padding:24px;">
  <div style="max-width:540px;margin:0 auto;">
    <p style="font-family:monospace;color:#72d980;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 16px;">
      kapadia.org &middot; job alerts
    </p>
    <h1 style="font-size:22px;font-weight:300;color:#e6e3dc;margin:0 0 8px;">
      Confirm your subscription${plural ? 's' : ''}
    </h1>
    <p style="color:#a8a59e;font-size:14px;margin:0 0 12px;">
      Click the link below to verify your email and start receiving digests for:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;">
      ${labelList}
    </ul>
    <a href="${esc(verifyUrl)}"
       style="display:inline-block;background:#e6e3dc;color:#111110;font-family:monospace;font-size:13px;
              padding:10px 20px;border-radius:2px;text-decoration:none;">
      Verify my subscription${plural ? 's' : ''}
    </a>
    <p style="color:#5a5856;font-size:11px;margin:24px 0 0;">
      If you did not sign up, ignore this email. Link expires in 24 hours.
    </p>
  </div>
</body>
</html>`;
}

export { corsPostOptions as onRequestOptions };
