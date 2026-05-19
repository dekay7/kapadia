/**
 * kapadia-job-digest — Standalone cron Worker
 *
 * Runs every 12 hours (see wrangler-digest.toml).
 * - Fetches SimplifyJobs JSON from GitHub (authenticated).
 * - Filters jobs by keyword into cybersecurity / IT categories.
 * - Upserts job_cache in D1.
 * - For each segment (category × listing_type), finds jobs new since last digest.
 * - Sends HTML digest emails via Resend to verified subscribers.
 * - Logs each digest run in digest_log.
 *
 * SYNC NOTE: KEYWORDS and categorize() below are an inline copy of
 * functions/lib/jobs-filter.js. Keep them in sync.
 * scripts/check-sync.js verifies parity at build time.
 */

// ── Cycle configuration (single source of truth) ────────────────────────────
const CYCLE = {
  year: 2026,
  internship: { repo: 'SimplifyJobs/Summer2026-Internships', branch: 'dev' },
  newgrad:    { repo: 'SimplifyJobs/New-Grad-Positions',     branch: 'dev' },
};

const GITHUB_RAW   = 'https://raw.githubusercontent.com';
const DATA_PATH    = '.github/scripts/listings.json';
const RESEND_API   = 'https://api.resend.com/emails';
const FROM_EMAIL   = 'Job Alerts <alerts@kapadia.org>';
const SITE         = 'https://kapadia.org';
const BATCH_SIZE   = 50;  // D1 batch limit is 1,000; 50 is safe and avoids large payloads

const SEGMENTS = [
  'cybersecurity:internship',
  'cybersecurity:newgrad',
  'it:internship',
  'it:newgrad',
];

// ── Inline copy of functions/lib/jobs-filter.js ──────────────────────────────
// SYNC: if you edit this block, mirror changes to functions/lib/jobs-filter.js

const KEYWORDS = {
  cybersecurity: [
    'security', 'cybersecurity', 'cyber security', 'soc ', 'siem',
    'pentest', 'penetration test', 'vulnerability', 'malware', 'forensic',
    'grc', 'cryptograph', 'threat intel', 'threat hunt', 'infosec',
    'appsec', 'devsecops', 'red team', 'blue team', 'incident response',
    'security engineer', 'security analyst', 'security operations',
    'endpoint security', 'network security', 'cloud security', 'zero trust',
  ],
  it: [
    'sysadmin', 'system administrator', 'help desk', 'helpdesk',
    'network engineer', 'network administrator', 'infrastructure engineer',
    'devops', 'site reliability', 'sre ', 'platform engineer',
    'cloud engineer', 'it intern', 'information technology',
    'systems engineer', 'it support', 'it operations',
  ],
};

const IT_WORD_RE = /\bit\b/i;

function categorize(title) {
  const lower = title.toLowerCase();
  const matches = [];
  for (const kw of KEYWORDS.cybersecurity) {
    if (lower.includes(kw)) { matches.push('cybersecurity'); break; }
  }
  let itMatch = KEYWORDS.it.some(kw => lower.includes(kw));
  if (!itMatch && IT_WORD_RE.test(lower)) itMatch = true;
  if (itMatch) matches.push('it');
  return matches;
}

// ── END inline copy ──────────────────────────────────────────────────────────

async function fetchListings(listingType, githubToken) {
  const cfg = CYCLE[listingType];
  const url = `${GITHUB_RAW}/${cfg.repo}/${cfg.branch}/${DATA_PATH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'User-Agent': 'kapadia-job-digest/1.0',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} for ${listingType}`);
  return res.json();
}

async function upsertJobs(db, jobs, listingType) {
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(({ job, category }) =>
      db.prepare(
        `INSERT INTO job_cache
           (source_id, category, listing_type, company_name, company_url, title,
            url, date_posted, date_updated, active, is_visible, locations, first_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, category, listing_type) DO UPDATE SET
           active       = excluded.active,
           is_visible   = excluded.is_visible,
           date_updated = excluded.date_updated`
      ).bind(
        job.id,
        category,
        listingType,
        job.company_name,
        job.company_url || null,
        job.title,
        job.url || null,
        job.date_posted || null,
        job.date_updated || null,
        job.active ? 1 : 0,
        job.is_visible ? 1 : 0,
        JSON.stringify(job.locations || []),
        now
      )
    );
    await db.batch(stmts);
  }
}

async function findNewJobs(db, segment) {
  const [category, listingType] = segment.split(':');

  const lastDigest = await db.prepare(
    'SELECT sent_job_ids FROM digest_log WHERE segment = ? ORDER BY sent_at DESC LIMIT 1'
  ).bind(segment).first();

  const allActive = await db.prepare(
    `SELECT source_id, company_name, title, url, locations, active
     FROM job_cache
     WHERE category = ? AND listing_type = ? AND active = 1 AND is_visible = 1`
  ).bind(category, listingType).all();

  if (!lastDigest) return allActive.results;

  let previousIds;
  try {
    previousIds = new Set(JSON.parse(lastDigest.sent_job_ids));
  } catch {
    previousIds = new Set();
  }
  return allActive.results.filter(j => !previousIds.has(j.source_id));
}

async function logDigest(db, segment, allActiveIds, newCount) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO digest_log (segment, sent_at, jobs_sent, sent_job_ids) VALUES (?, ?, ?, ?)'
  ).bind(segment, now, newCount, JSON.stringify(allActiveIds)).run();
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDigestEmail(subscriber, newJobs, segment) {
  const [category, listingType] = segment.split(':');
  const catLabel  = category === 'cybersecurity' ? 'Cybersecurity' : 'IT';
  const typeLabel = listingType === 'internship' ? `Internship ${CYCLE.year}` : `New Grad ${CYCLE.year}`;
  const count     = newJobs.length;
  const unsubUrl  = `${SITE}/api/jobs/unsubscribe?token=${encodeURIComponent(subscriber.unsub_token)}`;
  const toolUrl   = `${SITE}/tools/job-alerts/`;

  const jobRows = newJobs.slice(0, 50).map(job => {
    const locations = (() => {
      try {
        const locs = JSON.parse(job.locations || '[]');
        return Array.isArray(locs) && locs.length ? locs.slice(0, 2).map(esc).join(' &middot; ') : 'Remote / Multiple';
      } catch { return 'Remote / Multiple'; }
    })();
    const applyHref = job.url ? esc(job.url) : '#';
    const closedBadge = job.active === 1 ? '' : ' <span style="color:#cf6f6f;font-size:11px;">[Closed]</span>';
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #2a2926;vertical-align:top;">
        <div style="font-family:monospace;font-size:12px;color:#8a8884;margin-bottom:3px;">${esc(job.company_name)}${closedBadge}</div>
        <a href="${applyHref}" style="color:#7ac4a2;font-size:14px;text-decoration:none;">${esc(job.title)}</a>
        <div style="font-family:monospace;font-size:11px;color:#5a5856;margin-top:3px;">${locations}</div>
      </td>
    </tr>`;
  }).join('');

  const overflowNote = count > 50
    ? `<p style="color:#8a8884;font-size:12px;margin-top:16px;">…and ${count - 50} more. <a href="${esc(toolUrl)}" style="color:#7ac4a2;">View all on kapadia.org</a></p>`
    : '';

  const subject = `[kapadia.org] ${count} new ${catLabel} ${typeLabel} listing${count !== 1 ? 's' : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(subject)}</title></head>
<body style="background:#111110;color:#e6e3dc;font-family:'DM Sans',system-ui,sans-serif;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="font-family:monospace;color:#72d980;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
      kapadia.org &middot; job alerts
    </p>
    <h1 style="font-size:22px;font-weight:300;color:#e6e3dc;margin:0 0 4px;">
      ${count} New ${esc(catLabel)} ${esc(typeLabel)} Listing${count !== 1 ? 's' : ''}
    </h1>
    <p style="color:#8a8884;font-size:13px;margin:0 0 20px;">
      New since last digest &middot; Source: SimplifyJobs
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">${jobRows}</table>
    ${overflowNote}
    <hr style="border:none;border-top:1px solid #2a2926;margin:28px 0 16px;">
    <p style="color:#5a5856;font-size:11px;margin:0;">
      You subscribed to ${esc(catLabel)} ${esc(typeLabel)} alerts on kapadia.org.<br>
      <a href="${esc(unsubUrl)}" style="color:#5a5856;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}

async function sendDigestEmail(resendKey, subscriber, newJobs, segment) {
  const { subject, html } = buildDigestEmail(subscriber, newJobs, segment);
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [subscriber.email],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status}`);
}

async function runDigest(env) {
  const { DB, GITHUB_TOKEN, RESEND_API_KEY } = env;

  // 1. Fetch both listing files in parallel
  const [internships, newgrads] = await Promise.all([
    fetchListings('internship', GITHUB_TOKEN),
    fetchListings('newgrad', GITHUB_TOKEN),
  ]);

  // 2. Categorize each job and upsert into job_cache
  const internshipRows = internships.flatMap(
    job => categorize(job.title).map(category => ({ job, category }))
  );
  const newgradRows = newgrads.flatMap(
    job => categorize(job.title).map(category => ({ job, category }))
  );

  await Promise.all([
    upsertJobs(DB, internshipRows, 'internship'),
    upsertJobs(DB, newgradRows, 'newgrad'),
  ]);

  // 3. For each segment: find new jobs, send digests, log
  for (const segment of SEGMENTS) {
    const [category, listingType] = segment.split(':');

    const newJobs = await findNewJobs(DB, segment);
    if (newJobs.length === 0) continue;

    // Record all current active IDs so next run can diff against them
    const allActive = await DB.prepare(
      `SELECT source_id FROM job_cache
       WHERE category = ? AND listing_type = ? AND active = 1 AND is_visible = 1`
    ).bind(category, listingType).all();
    const allActiveIds = allActive.results.map(r => r.source_id);

    const subscribers = await DB.prepare(
      'SELECT email, unsub_token FROM subscribers WHERE category = ? AND listing_type = ? AND verified = 1'
    ).bind(category, listingType).all();

    for (const sub of subscribers.results) {
      try {
        await sendDigestEmail(RESEND_API_KEY, sub, newJobs, segment);
      } catch (err) {
        console.error(`Digest send failed for segment=${segment}:`, err.message);
      }
    }

    await logDigest(DB, segment, allActiveIds, newJobs.length);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDigest(env));
  },
};
