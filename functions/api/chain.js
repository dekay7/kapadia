/**
 * GET /api/chain
 * Supply Chain Auditor — kapadia.org
 *
 * Query params:
 *   url = page URL to audit (URL-encoded)
 *
 * Security:
 *   - Only http: and https: schemes accepted
 *   - Private/reserved IP ranges blocked (SSRF prevention)
 *   - DoH pre-resolution applied to target page URL AND each extracted resource URL
 *   - Max 20 external resources analyzed
 *   - HTML body capped at 128 KB; resource bodies capped at 256 KB
 *   - CORS restricted to kapadia.org; responses never cached
 */

import { parseIPv4, isPrivateIPv4, isPrivateIPv6, isPrivateAddress } from '../lib/ip.js';

const DOH_BASE       = 'https://cloudflare-dns.com/dns-query';
const SERVICE_UA     = 'kapadia.org-chain/1.0 (https://kapadia.org/tools/chain/)';

const MAX_RESOURCES  = 20;
const HTML_TIMEOUT   = 8000;
const RES_TIMEOUT    = 6000;
const DOH_TIMEOUT    = 4000;
const NPM_TIMEOUT    = 5000;
const HTML_CAP_BYTES = 131072;  // 128 KB
const RES_CAP_BYTES  = 262144;  // 256 KB

const BLOCKED_HOSTS = new Set([
  'localhost', '169.254.169.254', '0.0.0.0',
  'metadata.google.internal', 'computemetadata.internal', 'metadata.internal',
]);

// ── Helpers: IP detection ─────────────────────────────────────────────────────

function isIPv4Host(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }
function isIPv6Host(h) { return h.startsWith('[') && h.endsWith(']'); }

// ── URL validation (SSRF prevention) ─────────────────────────────────────────

function validateUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return 'Invalid URL format.'; }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http and https URLs are supported.';
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return 'That host is not allowed.';

  if (isIPv4Host(host)) {
    const o = parseIPv4(host);
    if (o && isPrivateIPv4(o)) return 'Private and reserved IP addresses are not allowed.';
  }

  if (isIPv6Host(parsed.hostname)) {
    const inner = parsed.hostname.slice(1, -1);
    if (isPrivateIPv6(inner)) return 'Private and reserved IPv6 addresses are not allowed.';
  }

  return null;
}

// ── DoH helpers ───────────────────────────────────────────────────────────────

async function dohQuery(name, type) {
  try {
    const res = await fetch(
      `${DOH_BASE}?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: 'application/dns-json', 'User-Agent': SERVICE_UA }, signal: AbortSignal.timeout(DOH_TIMEOUT) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.Answer || [];
  } catch { return []; }
}

async function checkHostnameSSRF(hostname) {
  const [aRecs, aaaaRecs] = await Promise.all([
    dohQuery(hostname, 'A'),
    dohQuery(hostname, 'AAAA'),
  ]);
  for (const rec of [...aRecs, ...aaaaRecs]) {
    if (rec.data && isPrivateAddress(rec.data)) {
      return 'Resolved address is in a private or reserved range.';
    }
  }
  return null;
}

async function ssrfCheck(url) {
  const err = validateUrl(url);
  if (err) return err;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (!isIPv4Host(host) && !isIPv6Host(host)) {
    return await checkHostnameSSRF(host);
  }
  return null;
}

// ── CORS response helper ──────────────────────────────────────────────────────

function cors(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://kapadia.org',
    },
  });
}

// ── Streaming body reader with cap ────────────────────────────────────────────

async function readCapped(res, maxBytes) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    if (total >= maxBytes) truncated = true;
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return { buf, truncated };
}

// ── Hash computation ──────────────────────────────────────────────────────────

function bufToHex(ab) {
  return Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bufToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function computeHashes(buffer) {
  const [raw256, raw512] = await Promise.all([
    crypto.subtle.digest('SHA-256', buffer),
    crypto.subtle.digest('SHA-512', buffer),
  ]);
  return {
    sha256: bufToHex(raw256),
    sha256b64: bufToBase64(raw256),
    sha512: bufToHex(raw512),
    sha512b64: bufToBase64(raw512),
  };
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function extractResources(html, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const results = [];

  // Collect all src/href matches from script and link tags
  const patterns = [
    /<script[^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<script[^>]+\bsrc\s*=\s*([^\s>]+)[^>]*>/gi,
    /<link[^>]+\brel\s*=\s*["']stylesheet["'][^>]+\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+\bhref\s*=\s*["']([^"']+)["'][^>]+\brel\s*=\s*["']stylesheet["'][^>]*>/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null && results.length < MAX_RESOURCES) {
      const raw = m[1].trim();
      if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) continue;

      let resolved;
      try { resolved = new URL(raw, baseUrl).href; } catch { continue; }

      const parsed = new URL(resolved);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (parsed.origin === base.origin) continue;  // same-origin — skip

      // Dedup key: URL without query/hash
      const deduped = parsed.origin + parsed.pathname;
      if (seen.has(deduped)) continue;
      seen.add(deduped);

      results.push(resolved);
    }
    if (results.length >= MAX_RESOURCES) break;
  }

  return results;
}

function extractSriMap(html) {
  const map = new Map();

  // Match script tags: either integrity before src or src before integrity
  const patterns = [
    /<script[^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]+\bintegrity\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<script[^>]+\bintegrity\s*=\s*["']([^"']+)["'][^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+\bhref\s*=\s*["']([^"']+)["'][^>]+\bintegrity\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+\bintegrity\s*=\s*["']([^"']+)["'][^>]+\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
  ];

  // Patterns where integrity comes first (groups swapped)
  const integrityFirstPatterns = new Set([1, 3]);

  patterns.forEach((re, idx) => {
    let m;
    while ((m = re.exec(html)) !== null) {
      let srcRaw, integrityVal;
      if (integrityFirstPatterns.has(idx)) {
        integrityVal = m[1];
        srcRaw = m[2];
      } else {
        srcRaw = m[1];
        integrityVal = m[2];
      }
      try {
        const parsed = new URL(srcRaw);
        const key = parsed.origin + parsed.pathname;
        if (!map.has(key)) map.set(key, integrityVal.trim());
      } catch { /* skip unparseable */ }
    }
  });

  return map;
}

function detectSensitivity(html) {
  const hasAuthForm = /<input[^>]+\btype\s*=\s*["']?password["']?/i.test(html)
    || /<input[^>]+\btype\s*=\s*["']?email["']?/i.test(html);

  const hasPaymentForm = /credit[-_]?card|card[-_]?number|cvv|cvc|expir|stripe|paypal|checkout|payment/i.test(html);

  return { hasAuthForm, hasPaymentForm };
}

// ── npm CDN pattern matching ──────────────────────────────────────────────────

function matchCdnPattern(url) {
  const u = new URL(url);

  // jsDelivr: cdn.jsdelivr.net/npm/@scope/pkg@ver/file  or  cdn.jsdelivr.net/npm/pkg@ver/file
  const jsdelivr = u.hostname === 'cdn.jsdelivr.net'
    && u.pathname.startsWith('/npm/');
  if (jsdelivr) {
    const path = u.pathname.slice(5); // strip /npm/
    const m = path.match(/^(@[^/]+\/[^@/]+|[^@/]+)@([^/]+)\/(.+)$/);
    if (m) return { cdn: 'jsdelivr', pkg: m[1], version: m[2], file: m[3] };
  }

  // unpkg: unpkg.com/@scope/pkg@ver/file  or  unpkg.com/pkg@ver/file
  if (u.hostname === 'unpkg.com') {
    const path = u.pathname.slice(1);
    const m = path.match(/^(@[^/]+\/[^@/]+|[^@/]+)@([^/]+)\/(.+)$/);
    if (m) return { cdn: 'unpkg', pkg: m[1], version: m[2], file: m[3] };
  }

  // cdnjs: cdnjs.cloudflare.com/ajax/libs/pkg/ver/file
  if (u.hostname === 'cdnjs.cloudflare.com' && u.pathname.startsWith('/ajax/libs/')) {
    const path = u.pathname.slice(11);
    const m = path.match(/^([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return { cdn: 'cdnjs', pkg: m[1], version: m[2], file: m[3] };
  }

  return null;
}

async function npmResolve(url) {
  const cdn = matchCdnPattern(url);
  if (!cdn) return null;

  try {
    if (cdn.cdn === 'cdnjs') {
      const apiUrl = `https://api.cdnjs.com/libraries/${encodeURIComponent(cdn.pkg)}/${encodeURIComponent(cdn.version)}?fields=sri`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(NPM_TIMEOUT), headers: { 'User-Agent': SERVICE_UA } });
      if (!res.ok) return { cdn: cdn.cdn, pkg: cdn.pkg, version: cdn.version, file: cdn.file, integrity: null, integrity_type: 'file', error: 'unavailable' };
      const data = await res.json();
      const sri = data.sri?.[cdn.file] || null;
      return { cdn: cdn.cdn, pkg: cdn.pkg, version: cdn.version, file: cdn.file, integrity: sri, integrity_type: 'file' };
    }

    // jsDelivr / unpkg → npm registry
    const regUrl = `https://registry.npmjs.org/${encodeURIComponent(cdn.pkg)}/${encodeURIComponent(cdn.version)}`;
    const res = await fetch(regUrl, { signal: AbortSignal.timeout(NPM_TIMEOUT), headers: { Accept: 'application/json', 'User-Agent': SERVICE_UA } });
    if (!res.ok) return { cdn: cdn.cdn, pkg: cdn.pkg, version: cdn.version, file: cdn.file, integrity: null, integrity_type: 'tarball', error: 'unavailable' };
    const data = await res.json();
    const integrity = data.dist?.integrity || null;
    return { cdn: cdn.cdn, pkg: cdn.pkg, version: cdn.version, file: cdn.file, integrity, integrity_type: 'tarball' };
  } catch {
    return { cdn: cdn?.cdn, pkg: cdn?.pkg, version: cdn?.version, file: cdn?.file, integrity: null, integrity_type: null, error: 'unavailable' };
  }
}

// ── SRI comparison ────────────────────────────────────────────────────────────

function checkSri(hashes, sriValue) {
  if (!sriValue) return null;
  const tokens = sriValue.trim().split(/\s+/);
  for (const token of tokens) {
    if (token.startsWith('sha256-') && token.slice(7) === hashes.sha256b64) return true;
    if (token.startsWith('sha512-') && token.slice(7) === hashes.sha512b64) return true;
  }
  return false;
}

// ── Per-resource risk scoring ─────────────────────────────────────────────────

function scoreResource(sri_present, sri_match, npm_info, consensus_match) {
  let score = 0;

  if (!sri_present)                        score += 10;
  if (sri_present && sri_match === false)  score += 40;
  if (npm_info?.integrity && npm_info.integrity_type === 'file' && !npmIntegrityMatch(npm_info)) score += 20;
  if (consensus_match === false)           score += 25;
  if (npm_info?.integrity && npm_info.integrity_type === 'file' && npmIntegrityMatch(npm_info) && !sri_present) score -= 5;

  if (score >= 40) return { score, level: 'critical' };
  if (score >= 20) return { score, level: 'high' };
  if (score >= 10) return { score, level: 'medium' };
  return { score: Math.max(0, score), level: 'low' };
}

function npmIntegrityMatch(npm_info) {
  // cdnjs returns exact file SRI — we can compare directly
  // npm registry returns tarball integrity — not directly comparable to file hash
  // Only mark npm_match=true for cdnjs (file-level) since we can verify exactly
  return false; // resource hash vs tarball hash is apples-to-oranges; always inconclusive for npm
}

// ── Analyze a single resource ─────────────────────────────────────────────────

async function analyzeResource(resourceUrl, sriMap) {
  // SSRF check on the extracted resource URL
  const ssrfErr = await ssrfCheck(resourceUrl);
  if (ssrfErr) {
    return { src: resourceUrl, error: ssrfErr, risk: 'unknown', risk_score: 0 };
  }

  let hashes1 = null;
  let fetchError = null;

  try {
    const res1 = await fetch(resourceUrl, {
      signal: AbortSignal.timeout(RES_TIMEOUT),
      headers: { 'Accept-Encoding': 'identity', 'User-Agent': SERVICE_UA },
      redirect: 'follow',
    });
    const { buf } = await readCapped(res1, RES_CAP_BYTES);
    hashes1 = await computeHashes(buf.buffer);
  } catch {
    fetchError = 'fetch_failed';
  }

  if (fetchError || !hashes1) {
    return { src: resourceUrl, error: fetchError || 'fetch_failed', risk: 'unknown', risk_score: 0 };
  }

  // SRI lookup (dedup key: origin + pathname, no query)
  const parsed = new URL(resourceUrl);
  const sriKey = parsed.origin + parsed.pathname;
  const sriExpected = sriMap.get(sriKey) || null;
  const sriPresent = sriExpected !== null;
  const sriMatch = sriPresent ? checkSri(hashes1, sriExpected) : null;

  // Second fetch for consensus check
  let consensusMatch = null;
  try {
    const res2 = await fetch(resourceUrl, {
      signal: AbortSignal.timeout(RES_TIMEOUT),
      headers: { 'Accept-Encoding': 'identity', 'User-Agent': SERVICE_UA },
      redirect: 'follow',
    });
    const { buf: buf2 } = await readCapped(res2, RES_CAP_BYTES);
    const hashes2 = await computeHashes(buf2.buffer);
    consensusMatch = hashes1.sha256 === hashes2.sha256;
  } catch { /* leave as null — network hiccup, not evidence of tampering */ }

  // npm registry cross-reference
  const npmInfo = await npmResolve(resourceUrl);

  const { score, level } = scoreResource(sriPresent, sriMatch, npmInfo, consensusMatch);

  return {
    src: resourceUrl,
    sha256: hashes1.sha256,
    sha256b64: hashes1.sha256b64,
    sha512: hashes1.sha512,
    sha512b64: hashes1.sha512b64,
    sri_expected: sriExpected,
    sri_present: sriPresent,
    sri_match: sriMatch,
    consensus_match: consensusMatch,
    npm: npmInfo,
    risk: level,
    risk_score: score,
    error: null,
  };
}

// ── Overall risk computation ──────────────────────────────────────────────────

function computeOverallRisk(resources, sensitivity) {
  let total = resources.reduce((s, r) => s + (r.risk_score || 0), 0);

  if (sensitivity.hasPaymentForm) total *= 1.5;
  else if (sensitivity.hasAuthForm) total *= 1.2;

  total = Math.round(total);

  const level = total > 60 ? 'critical' : total > 30 ? 'high' : total > 10 ? 'medium' : 'low';
  return { overall_score: total, overall_risk: level };
}

// ── Main request handler ──────────────────────────────────────────────────────

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return cors({ error: 'Missing required parameter: url' }, 400);
  }

  // Validate and SSRF-check the target page URL
  const validErr = validateUrl(rawUrl);
  if (validErr) return cors({ error: validErr }, 400);

  const parsedInput = new URL(rawUrl);
  if (!isIPv4Host(parsedInput.hostname) && !isIPv6Host(parsedInput.hostname)) {
    const ssrfErr = await checkHostnameSSRF(parsedInput.hostname);
    if (ssrfErr) return cors({ error: ssrfErr }, 400);
  }

  // Fetch the target page HTML
  let html, fetchedUrl;
  let truncated = false;
  try {
    const res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(HTML_TIMEOUT),
      redirect: 'follow',
      headers: { 'User-Agent': SERVICE_UA, Accept: 'text/html,*/*' },
    });
    fetchedUrl = res.url;
    const { buf, truncated: t } = await readCapped(res, HTML_CAP_BYTES);
    truncated = t;
    html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } catch {
    return cors({ error: 'Failed to fetch the target URL. It may be unreachable or blocking automated requests.' }, 502);
  }

  const sensitivity = detectSensitivity(html);
  const resourceUrls = extractResources(html, fetchedUrl || rawUrl);
  const sriMap = extractSriMap(html);

  // Analyze all resources concurrently
  const settled = await Promise.allSettled(
    resourceUrls.map(u => analyzeResource(u, sriMap))
  );
  const resources = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { src: resourceUrls[i], error: 'analysis_failed', risk: 'unknown', risk_score: 0 }
  );

  const unprotectedCount = resources.filter(r => r.sri_present === false && !r.error).length;
  const { overall_score, overall_risk } = computeOverallRisk(resources, sensitivity);

  return cors({
    url: rawUrl,
    fetched_url: fetchedUrl || rawUrl,
    truncated,
    resource_count: resources.length,
    unprotected_count: unprotectedCount,
    has_auth_form: sensitivity.hasAuthForm,
    has_payment_form: sensitivity.hasPaymentForm,
    overall_score,
    overall_risk,
    resources,
    timestamp: new Date().toISOString(),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  'https://kapadia.org',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}
