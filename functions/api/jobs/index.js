/**
 * GET /api/jobs?category=cybersecurity|it&type=internship|newgrad
 * Returns filtered job listings from D1 cache.
 */

import { cors, corsOptions } from '../../lib/cors.js';

const VALID_CATEGORIES = new Set(['cybersecurity', 'it']);
const VALID_TYPES = new Set(['internship', 'newgrad']);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const type = url.searchParams.get('type');

  if (!VALID_CATEGORIES.has(category)) {
    return cors({ error: 'Invalid category. Must be cybersecurity or it.' }, 400);
  }
  if (!VALID_TYPES.has(type)) {
    return cors({ error: 'Invalid type. Must be internship or newgrad.' }, 400);
  }

  const result = await env.DB.prepare(
    `SELECT source_id, company_name, company_url, title, url, date_posted,
            active, is_visible, locations, first_seen_at
     FROM job_cache
     WHERE category = ? AND listing_type = ?
     ORDER BY first_seen_at DESC
     LIMIT 200`
  ).bind(category, type).all();

  const jobs = result.results.map(row => ({
    id:           row.source_id,
    company:      row.company_name,
    company_url:  row.company_url || null,
    title:        row.title,
    url:          row.url || null,
    date_posted:  row.date_posted || null,
    active:       row.active === 1,
    locations:    parseLocations(row.locations),
    first_seen:   row.first_seen_at,
  }));

  return cors({ jobs, total: jobs.length });
}

function parseLocations(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export { corsOptions as onRequestOptions };
