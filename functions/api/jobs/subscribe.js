/**
 * POST /api/jobs/subscribe
 * Body: { email, category, listing_type }
 * Stores subscriber in D1 and sends a verification email via Resend.
 */

import { cors, corsPostOptions } from '../../lib/cors.js';

const VALID_CATEGORIES = new Set(['cybersecurity', 'it']);
const VALID_TYPES = new Set(['internship', 'newgrad']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Job Alerts <alerts@kapadia.org>';
const SITE = 'https://kapadia.org';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return cors({ error: 'Invalid JSON body.' }, 400);
  }

  const { email, category, listing_type } = body ?? {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return cors({ error: 'Invalid email address.' }, 400);
  }
  if (!VALID_CATEGORIES.has(category)) {
    return cors({ error: 'Invalid category.' }, 400);
  }
  if (!VALID_TYPES.has(listing_type)) {
    return cors({ error: 'Invalid listing_type.' }, 400);
  }

  const verifyToken = randomHex();
  const unsubToken  = randomHex();
  const now = Math.floor(Date.now() / 1000);

  // Atomic upsert: only overwrites an existing row if it is not yet verified.
  // If the subscriber is already verified, changes === 0 and we return early
  // without sending another email, eliminating the check-then-write race.
  const result = await env.DB.prepare(
    `INSERT INTO subscribers (email, category, listing_type, verified, verify_token, unsub_token, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(email, category, listing_type) DO UPDATE SET
       verify_token = excluded.verify_token,
       unsub_token  = excluded.unsub_token,
       verified     = 0,
       created_at   = excluded.created_at
     WHERE subscribers.verified = 0`
  ).bind(email, category, listing_type, verifyToken, unsubToken, now).run();

  if (result.meta.changes === 0) {
    return cors({ ok: true, already: true });
  }

  const verifyUrl = `${SITE}/api/jobs/verify?token=${verifyToken}`;
  const catLabel  = category === 'cybersecurity' ? 'Cybersecurity' : 'IT';
  const typeLabel = listing_type === 'internship' ? 'Internship 2026' : 'New Grad 2026';

  const emailHtml = buildVerificationEmail(verifyUrl, catLabel, typeLabel);

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [email],
      subject: `Verify your ${catLabel} ${typeLabel} job alerts`,
      html:    emailHtml,
    }),
    signal: AbortSignal.timeout(8000),
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

function buildVerificationEmail(verifyUrl, catLabel, typeLabel) {
  const safeUrl = esc(verifyUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Verify your job alerts</title></head>
<body style="background:#111110;color:#e6e3dc;font-family:'DM Sans',system-ui,sans-serif;margin:0;padding:24px;">
  <div style="max-width:540px;margin:0 auto;">
    <p style="font-family:monospace;color:#72d980;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 16px;">
      kapadia.org &middot; job alerts
    </p>
    <h1 style="font-size:22px;font-weight:300;color:#e6e3dc;margin:0 0 8px;">
      Confirm your subscription
    </h1>
    <p style="color:#a8a59e;font-size:14px;margin:0 0 24px;">
      You signed up for <strong style="color:#e6e3dc;">${esc(catLabel)} ${esc(typeLabel)}</strong> alerts.
      Click below to verify your email and start receiving digests.
    </p>
    <a href="${safeUrl}"
       style="display:inline-block;background:#e6e3dc;color:#111110;font-family:monospace;font-size:13px;
              padding:10px 20px;border-radius:2px;text-decoration:none;">
      Verify Email
    </a>
    <p style="color:#5a5856;font-size:11px;margin:24px 0 0;">
      If you did not sign up, ignore this email. The link expires after use.
    </p>
  </div>
</body>
</html>`;
}

export { corsPostOptions as onRequestOptions };
