/**
 * kapadia-job-digest — Standalone cron Worker
 *
 * Runs once per day at 14:00 UTC (see wrangler-digest.toml).
 * - Fetches SimplifyJobs JSON from GitHub (authenticated).
 * - Filters jobs by keyword into cybersecurity / IT categories.
 * - Upserts job_cache in D1.
 * - For each segment (category × listing_type), finds jobs new since last digest.
 * - Sends one consolidated HTML digest email per unique subscriber via Resend.
 * - Caps sends at MAX_DIGEST_RECIPIENTS to stay within Resend free-tier limits.
 * - Logs each digest run in digest_log.
 *
 * SYNC NOTE: KEYWORDS and categorize() below are an inline copy of
 * functions/lib/jobs-filter.js. Keep them in sync.
 * scripts/check-sync.js verifies parity at build time.
 *
 * LIMITS NOTE: Quota constants are imported from functions/lib/limits.js.
 * BATCH_SIZE is kept local — it is a D1 implementation detail, not a business limit.
 */

import {
  MAX_SUBSCRIBERS,
  MAX_JOBS_PER_EMAIL,
  JOB_RETENTION_DAYS,
  RESEND_TIMEOUT_MS,
  GITHUB_FETCH_TIMEOUT_MS,
} from './functions/lib/limits.js';

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
const BATCH_SIZE   = 50;  // D1 batch ceiling — not a business limit; keep local

const MAX_DIGEST_RECIPIENTS = MAX_SUBSCRIBERS; // alias for clarity at the send site

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
    // Core
    'security', 'cybersecurity', 'cyber security',
    // Cyber-prefixed roles
    'cyber analyst', 'cyber engineer', 'cyber operations', 'cyber defense',
    // SIEM
    'siem',
    // Offensive / testing
    'pentest', 'penetration test', 'red team', 'purple team',
    // Defensive / response
    'blue team', 'incident response', 'insider threat', 'intrusion',
    // Intelligence / modeling
    'threat intel', 'threat hunt', 'threat model', 'osint',
    // Malware / threats
    'vulnerability', 'malware', 'ransomware', 'phishing',
    // Forensics / RE
    'forensic', 'reverse engineer',
    // Disciplines
    'grc', 'cryptograph', 'infosec', 'appsec', 'devsecops',
    // Domains
    'endpoint security', 'network security', 'cloud security', 'zero trust',
    // Identity / privacy
    'identity and access', 'iam ', 'privacy engineer', 'data privacy',
  ],
  it: [
    // Admin
    'sysadmin', 'system administrator', 'systems administration',
    'it administrator', 'linux administrator',
    // Support
    'help desk', 'helpdesk', 'service desk', 'desktop support', 'technical support',
    'it support', 'it specialist', 'it analyst', 'it technician', 'it operations',
    'it intern', 'information technology',
    // Network
    'network engineer', 'network administrator', 'network technician',
    'network operations', 'noc ',
    // Infrastructure / cloud
    'infrastructure engineer', 'infrastructure admin',
    'cloud engineer', 'cloud architect', 'cloud administrator', 'cloud operations',
    // Engineering / SRE / DevOps
    'devops', 'site reliability', 'sre ', 'platform engineer', 'systems engineer',
    // Database
    'database administrator', 'dba ',
    // Directory
    'active directory',
  ],
};

const IT_WORD_RE = /\bit\b/i;
const SOC_RE = /\bSOC\b/;

function categorize(title) {
  const lower = title.toLowerCase();
  const matches = [];
  const cyberMatch = KEYWORDS.cybersecurity.some(kw => lower.includes(kw)) || SOC_RE.test(title);
  if (cyberMatch) matches.push('cybersecurity');
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
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
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

async function purgeOldJobs(db) {
  const cutoff = Math.floor(Date.now() / 1000) - JOB_RETENTION_DAYS * 86400;
  await db.prepare('DELETE FROM job_cache WHERE first_seen_at < ?').bind(cutoff).run();
}

async function findNewJobs(db, segment) {
  const [category, listingType] = segment.split(':');

  const lastDigest = await db.prepare(
    'SELECT sent_job_ids FROM digest_log WHERE segment = ? ORDER BY sent_at DESC LIMIT 1'
  ).bind(segment).first();

  const allActive = await db.prepare(
    `SELECT source_id, company_name, title, url, locations, active, date_posted, first_seen_at
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

function fmtEmailDate(timestamp) {
  if (!timestamp) return null;
  const d = new Date(timestamp * 1000);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildJobRows(newJobs) {
  const sorted = newJobs.slice().sort((a, b) => {
    const da = a.date_posted ?? 0;
    const db = b.date_posted ?? 0;
    if (db !== da) return db - da;
    return (b.first_seen_at ?? 0) - (a.first_seen_at ?? 0);
  });

  return sorted.slice(0, MAX_JOBS_PER_EMAIL).map(job => {
    const locations = (() => {
      try {
        const locs = JSON.parse(job.locations || '[]');
        return Array.isArray(locs) && locs.length ? locs.slice(0, 2).map(esc).join(' &middot; ') : 'Remote / Multiple';
      } catch { return 'Remote / Multiple'; }
    })();
    const applyHref  = job.url ? esc(job.url) : '#';
    const closedBadge = job.active === 1 ? '' : ' <span style="color:#cf6f6f;font-size:11px;">[Closed]</span>';
    const dateStr    = fmtEmailDate(job.date_posted);
    const metaLine   = dateStr ? `${esc(dateStr)} &middot; ${locations}` : locations;
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #2a2926;vertical-align:top;">
        <div style="font-family:monospace;font-size:12px;color:#8a8884;margin-bottom:3px;">${esc(job.company_name)}${closedBadge}</div>
        <a href="${applyHref}" style="color:#7ac4a2;font-size:14px;text-decoration:none;">${esc(job.title)}</a>
        <div style="font-family:monospace;font-size:11px;color:#5a5856;margin-top:3px;">${metaLine}</div>
      </td>
    </tr>`;
  }).join('');
}

function buildConsolidatedEmail(sections, globalUnsubToken) {
  // sections: Array<{ segment, newJobs, unsub_token }>
  const toolUrl = `${SITE}/tools/job-alerts/`;

  const sectionBlocks = sections.map(({ segment, newJobs, unsub_token }) => {
    const [category, listingType] = segment.split(':');
    const catLabel  = category === 'cybersecurity' ? 'Cybersecurity' : 'IT';
    const typeLabel = listingType === 'internship' ? `Internship ${CYCLE.year}` : `New Grad ${CYCLE.year}`;
    const count     = newJobs.length;
    const unsubUrl  = `${SITE}/api/jobs/unsubscribe?token=${encodeURIComponent(unsub_token)}`;

    const overflowNote = count > MAX_JOBS_PER_EMAIL
      ? `<p style="color:#8a8884;font-size:12px;margin-top:16px;">…and ${count - MAX_JOBS_PER_EMAIL} more. <a href="${esc(toolUrl)}" style="color:#7ac4a2;">View all on kapadia.org</a></p>`
      : '';

    return `
    <div style="margin-bottom:32px;">
      <h2 style="font-size:17px;font-weight:400;color:#e6e3dc;margin:0 0 4px;">
        ${count} New ${esc(catLabel)} ${esc(typeLabel)} Listing${count !== 1 ? 's' : ''}
      </h2>
      <p style="color:#8a8884;font-size:12px;margin:0 0 14px;">New since last digest &middot; Source: SimplifyJobs</p>
      <table width="100%" cellpadding="0" cellspacing="0">${buildJobRows(newJobs)}</table>
      ${overflowNote}
      <p style="color:#5a5856;font-size:11px;margin:12px 0 0;">
        <a href="${esc(unsubUrl)}" style="color:#5a5856;">Unsubscribe from ${esc(catLabel)} ${esc(typeLabel)} alerts</a>
      </p>
    </div>`;
  }).join('<hr style="border:none;border-top:1px solid #2a2926;margin:0 0 28px;">');

  // Subject: single section uses original format; multiple sections lists them
  let subject;
  if (sections.length === 1) {
    const { segment, newJobs } = sections[0];
    const [category, listingType] = segment.split(':');
    const catLabel  = category === 'cybersecurity' ? 'Cybersecurity' : 'IT';
    const typeLabel = listingType === 'internship' ? `Internship ${CYCLE.year}` : `New Grad ${CYCLE.year}`;
    const count     = newJobs.length;
    subject = `[kapadia.org] ${count} new ${catLabel} ${typeLabel} listing${count !== 1 ? 's' : ''}`;
  } else {
    const labels = sections.map(({ segment }) => {
      const [cat, type] = segment.split(':');
      return `${cat === 'cybersecurity' ? 'Cybersecurity' : 'IT'} ${type === 'internship' ? 'Internship' : 'New Grad'}`;
    }).join(' · ');
    subject = `[kapadia.org] New job listings — ${labels}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(subject)}</title></head>
<body style="background:#111110;color:#e6e3dc;font-family:'DM Sans',system-ui,sans-serif;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="font-family:monospace;color:#72d980;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
      kapadia.org &middot; job alerts
    </p>
    ${sectionBlocks}
    <hr style="border:none;border-top:1px solid #2a2926;margin:28px 0 16px;">
    <p style="color:#5a5856;font-size:11px;margin:0;">
      ${globalUnsubToken ? `<a href="${esc(`${SITE}/api/jobs/unsubscribe-all?token=${encodeURIComponent(globalUnsubToken)}`)}" style="color:#5a5856;">Unsubscribe from all alerts</a> &middot; ` : ''}You are receiving this because you subscribed to job alerts on kapadia.org.
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}

async function sendConsolidatedEmail(resendKey, email, sections, globalUnsubToken) {
  const { subject, html } = buildConsolidatedEmail(sections, globalUnsubToken);
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject, html }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
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

  // 2.5. Purge rows older than JOB_RETENTION_DAYS
  await purgeOldJobs(DB);

  // 3. For each segment: find new jobs and log. Collect into a map.
  const newJobsMap = {};  // segment → Job[]

  for (const segment of SEGMENTS) {
    const [category, listingType] = segment.split(':');

    const newJobs = await findNewJobs(DB, segment);
    if (newJobs.length === 0) continue;

    // Record all current active IDs so next run can diff against them.
    // Log before sending: a mid-run crash produces misses, not duplicate sends.
    const allActive = await DB.prepare(
      `SELECT source_id FROM job_cache
       WHERE category = ? AND listing_type = ? AND active = 1 AND is_visible = 1`
    ).bind(category, listingType).all();
    const allActiveIds = allActive.results.map(r => r.source_id);

    await logDigest(DB, segment, allActiveIds, newJobs.length);
    newJobsMap[segment] = newJobs;
  }

  const activeSegments = Object.keys(newJobsMap);
  if (activeSegments.length === 0) return;

  // 4. Query all verified subscribers for active segments in one shot.
  const placeholders = activeSegments.map(() => '(category = ? AND listing_type = ?)').join(' OR ');
  const binds = activeSegments.flatMap(seg => seg.split(':'));

  const rows = await DB.prepare(
    `SELECT email, category, listing_type, unsub_token, global_unsub_token
     FROM subscribers
     WHERE verified = 1 AND (${placeholders})`
  ).bind(...binds).all();

  // 5. Group by email.
  const byEmail = new Map();
  for (const row of rows.results) {
    const segment = `${row.category}:${row.listing_type}`;
    if (!byEmail.has(row.email)) {
      byEmail.set(row.email, { subs: [], globalUnsubToken: row.global_unsub_token });
    }
    byEmail.get(row.email).subs.push({ segment, unsub_token: row.unsub_token });
  }

  // 6. Cap at MAX_DIGEST_RECIPIENTS and send one consolidated email per user.
  if (byEmail.size > MAX_DIGEST_RECIPIENTS) {
    console.warn(`Digest capped at ${MAX_DIGEST_RECIPIENTS}; ${byEmail.size} unique subscribers`);
  }

  const recipients = [...byEmail.entries()].slice(0, MAX_DIGEST_RECIPIENTS);

  for (const [email, { subs, globalUnsubToken }] of recipients) {
    const sections = subs
      .filter(s => newJobsMap[s.segment])
      .map(s => ({ segment: s.segment, newJobs: newJobsMap[s.segment], unsub_token: s.unsub_token }));

    if (sections.length === 0) continue;

    try {
      await sendConsolidatedEmail(RESEND_API_KEY, email, sections, globalUnsubToken);
    } catch (err) {
      console.error(`Digest send failed for ${email}:`, err.message);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDigest(env));
  },
};
