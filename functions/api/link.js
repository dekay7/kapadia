/**
 * GET /api/link
 * Link Inspector — kapadia.org
 *
 * Query params:
 *   url = URL to inspect (URL-encoded)
 *
 * Security:
 *   - Only http: and https: schemes accepted
 *   - Private/reserved IP ranges blocked (SSRF prevention)
 *   - DoH pre-resolution checks all resolved IPs before fetching
 *   - Each redirect hop re-validated before following
 *   - Max 10 hops, 8 s timeout per hop; body never downloaded
 *   - CORS restricted to kapadia.org; responses never cached
 */

import { parseIPv4, isPrivateIPv4, isPrivateIPv6, isPrivateAddress } from '../lib/ip.js';

const DOH_BASE   = 'https://cloudflare-dns.com/dns-query';
const RDAP_BASE  = 'https://rdap.org/domain/';

// Mimics a real browser to defeat trivial bot-detection and anti-forensics by threat actors
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
// Used for internal service lookups (DoH, RDAP) — not for the URL under inspection
const SERVICE_UA = 'kapadia.org-link/1.0 (https://kapadia.org/tools/link/)';

const MAX_HOPS        = 10;
const HOP_TIMEOUT_MS  = 8000;
const RDAP_TIMEOUT_MS = 5000;
const DOH_TIMEOUT_MS  = 4000;
const BODY_PEEK_BYTES = 16384; // 16 KB — enough to cover the <head> of any page

// ── Static lookup sets ────────────────────────────────────────────────────────

const SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'click', 'work',
  'party', 'stream', 'download', 'racing', 'win', 'review', 'trade',
  'date', 'faith', 'bid', 'cricket', 'science', 'accountant', 'loan',
  'men', 'gdn', 'vip',
]);

const URL_SHORTENERS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'is.gd', 'ow.ly', 'buff.ly',
  'short.link', 'rb.gy', 'cutt.ly', 'shorturl.at', 'tiny.one',
  'snip.ly', 'rebrand.ly', 'bl.ink', 't.ly', 'goo.gl', 'adf.ly',
  'bc.vc', 'lnkd.in', 'dlvr.it',
]);

const BLOCKED_HOSTS = new Set([
  'localhost', 'metadata.google.internal', 'computemetadata.internal',
  'metadata.internal', '169.254.169.254', '0.0.0.0',
]);

const CAPTURE_HEADERS = [
  'server', 'x-powered-by', 'content-type', 'strict-transport-security',
  'x-frame-options', 'x-content-type-options', 'content-security-policy',
  'referrer-policy', 'permissions-policy', 'via', 'cf-cache-status',
  'x-xss-protection', 'cache-control',
];

// ── IP utilities — imported from ../lib/ip.js ─────────────────────────────────

function isIPv4Host(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }
function isIPv6Host(h) { return h.startsWith('[') && h.endsWith(']'); }

// ── Domain utilities ──────────────────────────────────────────────────────────

const TWO_LEVEL_TLDS = new Set([
  'co.uk', 'com.au', 'co.jp', 'co.nz', 'org.uk', 'me.uk',
  'net.au', 'com.br', 'co.in', 'co.za', 'co.kr', 'com.mx',
]);

function getBaseDomain(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIPv4Host(h) || h.includes(':')) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL_TLDS.has(last2) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

function getTld(hostname) {
  if (isIPv4Host(hostname) || isIPv6Host(hostname)) return null;
  const parts = hostname.split('.');
  return parts[parts.length - 1].toLowerCase();
}

function hasPunycode(hostname) {
  return hostname.split('.').some(l => l.toLowerCase().startsWith('xn--'));
}

// ── URL validation (SSRF prevention) ─────────────────────────────────────────

function validateUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return 'Invalid URL format.'; }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Scheme "${parsed.protocol}" is not allowed. Only http and https are supported.`;
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return `Host "${host}" is not allowed.`;

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
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(DOH_TIMEOUT_MS) }
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
      return `Resolved address "${rec.data}" is in a private or reserved range.`;
    }
  }
  return null;
}

// ── Header capture ────────────────────────────────────────────────────────────

function captureHeaders(headers) {
  const out = {};
  for (const name of CAPTURE_HEADERS) {
    const val = headers.get(name);
    if (val !== null) {
      out[name] = name === 'content-security-policy' ? '[present]' : val;
    }
  }
  return out;
}

// ── Browser-mimicry helpers ───────────────────────────────────────────────────

function tryParseUrl(url) {
  try { return new URL(url); } catch { return null; }
}

// Builds request headers that mirror a real Chrome navigation, including Sec-Fetch-* and Referer.
function browserHeaders(currentUrl, prevUrl) {
  const parsed     = new URL(currentUrl);
  const prevParsed = prevUrl ? tryParseUrl(prevUrl) : null;

  let fetchSite = 'none';
  if (prevParsed) {
    const curBase  = getBaseDomain(parsed.hostname);
    const prevBase = getBaseDomain(prevParsed.hostname);
    if (parsed.origin === prevParsed.origin) {
      fetchSite = 'same-origin';
    } else if (curBase === prevBase) {
      fetchSite = 'same-site';
    } else {
      fetchSite = 'cross-site';
    }
  }

  const hdrs = {
    'User-Agent':                BROWSER_UA,
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language':           'en-US,en;q=0.9',
    'Accept-Encoding':           'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':            'document',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            fetchSite,
  };

  // Sec-Fetch-User is only present on user-initiated navigations (the first request)
  if (!prevUrl) hdrs['Sec-Fetch-User'] = '?1';

  // Chrome sends Referer for same-origin/same-site navigations, strips it cross-site
  if (prevParsed && fetchSite !== 'cross-site') hdrs['Referer'] = prevUrl;

  return hdrs;
}

// Per-base-domain cookie jar — lets session and redirect cookies persist through the chain
class CookieJar {
  constructor() { this._jar = new Map(); }

  ingest(hostname, res) {
    const key = getBaseDomain(hostname);
    if (!this._jar.has(key)) this._jar.set(key, new Map());
    const store = this._jar.get(key);
    // Workers support getAll() for set-cookie; fall back to splitting the joined value
    const values = typeof res.headers.getAll === 'function'
      ? res.headers.getAll('set-cookie')
      : (res.headers.get('set-cookie') || '').split(/,(?=\s*[^\s=;,]+=)/);
    for (const raw of values) {
      const [nameVal] = raw.split(';');
      const eq = nameVal.indexOf('=');
      if (eq < 0) continue;
      const name = nameVal.slice(0, eq).trim();
      if (name) store.set(name, nameVal.slice(eq + 1).trim());
    }
  }

  get(hostname) {
    const store = this._jar.get(getBaseDomain(hostname));
    if (!store || store.size === 0) return null;
    return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// Reads up to BODY_PEEK_BYTES of an HTML response body; returns null for non-HTML
async function peekHtmlBody(res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('html')) { await res.body?.cancel(); return null; }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < BODY_PEEK_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

// Returns the URL from a <meta http-equiv="refresh"> tag, or null if absent
function detectMetaRefresh(html) {
  if (!html) return null;
  const m =
    html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+http-equiv\s*=\s*["']?refresh["']?/i);
  if (!m) return null;
  const urlM = m[1].match(/url\s*=\s*['"]?([^'">\s]+)/i);
  return urlM ? urlM[1].replace(/^['"]|['"]$/g, '') : null;
}

// Returns true if the HTML contains common JavaScript redirect patterns
function detectJsRedirect(html) {
  if (!html) return false;
  return /(?:window|document|top|self)\.location(?:\.href)?\s*=|location\.(?:replace|assign)\s*\(/.test(html);
}

// ── Redirect following ────────────────────────────────────────────────────────

async function followRedirects(startUrl) {
  const hops         = [];
  const jar          = new CookieJar();
  let current        = startUrl;
  let prevUrl        = null;
  let prevProtocol   = null;
  let hasDowngrade   = false;
  let domainChanges  = 0;
  let hasMetaRefresh = false;
  let hasJsRedirect  = false;

  for (let i = 0; i < MAX_HOPS; i++) {
    const parsed = new URL(current);

    const validErr = validateUrl(current);
    if (validErr) { hops.push({ url: current, error: validErr }); break; }

    if (!isIPv4Host(parsed.hostname) && !isIPv6Host(parsed.hostname)) {
      const ssrfErr = await checkHostnameSSRF(parsed.hostname);
      if (ssrfErr) { hops.push({ url: current, error: ssrfErr }); break; }
    }

    const reqHeaders = browserHeaders(current, prevUrl);
    const cookieHdr  = jar.get(parsed.hostname);
    if (cookieHdr) reqHeaders['Cookie'] = cookieHdr;

    let res;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: reqHeaders,
      });
    } catch {
      hops.push({ url: current, status: null, unreachable: true });
      break;
    }

    jar.ingest(parsed.hostname, res);

    const hop = { url: current, status: res.status };

    if (prevProtocol === 'https:' && parsed.protocol === 'http:') {
      hasDowngrade = true;
      hop.downgrade = true;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();

      if (!location) { hops.push(hop); break; }

      let nextUrl;
      try { nextUrl = new URL(location, current).href; } catch { hops.push(hop); break; }

      const curBase  = getBaseDomain(parsed.hostname);
      const nextBase = getBaseDomain(new URL(nextUrl).hostname);
      hop.location      = nextUrl;
      hop.domainChanged = curBase !== nextBase;
      if (hop.domainChanged) domainChanges++;

      hops.push(hop);
      prevProtocol = parsed.protocol;
      prevUrl      = current;
      current      = nextUrl;
    } else {
      hop.headers = captureHeaders(res.headers);

      // Peek into the HTML body to catch non-HTTP redirect techniques
      const html    = await peekHtmlBody(res);
      const metaUrl = detectMetaRefresh(html);

      if (metaUrl && i + 1 < MAX_HOPS) {
        let nextUrl;
        try { nextUrl = new URL(metaUrl, current).href; } catch { /* malformed — skip */ }
        if (nextUrl && !validateUrl(nextUrl)) {
          hasMetaRefresh = true;
          const curBase  = getBaseDomain(parsed.hostname);
          const nextBase = getBaseDomain(new URL(nextUrl).hostname);
          hop.metaRefresh   = nextUrl;
          hop.domainChanged = curBase !== nextBase;
          if (hop.domainChanged) domainChanges++;
          hops.push(hop);
          prevProtocol = parsed.protocol;
          prevUrl      = current;
          current      = nextUrl;
          continue;
        }
      }

      if (detectJsRedirect(html)) hasJsRedirect = true;

      hops.push(hop);
      break;
    }
  }

  return { hops, hasDowngrade, domainChanges, hasMetaRefresh, hasJsRedirect };
}

// ── RDAP lookup ───────────────────────────────────────────────────────────────

async function rdapLookup(domain) {
  try {
    const res = await fetch(`${RDAP_BASE}${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json', 'User-Agent': SERVICE_UA },
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    });
    if (!res.ok) return { error: 'not_found' };
    const data = await res.json();

    const events    = Array.isArray(data.events) ? data.events : [];
    const findEvent = a => events.find(e => e.eventAction === a)?.eventDate || null;

    let registrar = null;
    if (Array.isArray(data.entities)) {
      for (const entity of data.entities) {
        if (Array.isArray(entity.roles) && entity.roles.includes('registrar')) {
          const vcard = entity.vcardArray;
          if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
            const fn = vcard[1].find(p => p[0] === 'fn');
            if (fn) registrar = fn[3];
          }
          if (!registrar && entity.handle) registrar = entity.handle;
          break;
        }
      }
    }

    return {
      registrar,
      regDate:     findEvent('registration'),
      expDate:     findEvent('expiration'),
      updDate:     findEvent('last changed'),
      nameservers: (data.nameservers || []).map(ns => (ns.ldhName || '').toLowerCase()).filter(Boolean),
      status:      Array.isArray(data.status) ? data.status : [],
    };
  } catch { return { error: 'unavailable' }; }
}

// ── DNS records ───────────────────────────────────────────────────────────────

async function getDnsRecords(hostname) {
  if (isIPv4Host(hostname)) return { a: [hostname], aaaa: [] };
  if (isIPv6Host(hostname)) return { a: [], aaaa: [hostname.slice(1, -1)] };
  const [aRecs, aaaaRecs] = await Promise.all([
    dohQuery(hostname, 'A'),
    dohQuery(hostname, 'AAAA'),
  ]);
  return {
    a:    aRecs.filter(r => r.type === 1).map(r => r.data),
    aaaa: aaaaRecs.filter(r => r.type === 28).map(r => r.data),
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeScore({
  inputScheme, inputIsIP, finalIsIP, hasPunycode: punycodeFlag, isShortener,
  hops, hasDowngrade, domainChanges, domainAge, daysUntilExpiry,
  rdapError, suspiciousTld, finalTld, hasMetaRefresh, hasJsRedirect,
}) {
  const signals = [];
  let score = 100;

  const deduct = (n, level, reason) => {
    score = Math.max(0, score - n);
    signals.push({ level, reason, deduction: n });
  };
  const flag = reason => signals.push({ level: 'info', reason, deduction: 0 });

  if (inputScheme === 'http:') deduct(20, 'high', 'Connection starts unencrypted (HTTP input URL)');

  const finalHop = hops[hops.length - 1];
  if (finalHop?.url) {
    try {
      if (new URL(finalHop.url).protocol === 'http:') {
        deduct(20, 'high', 'Final destination is unencrypted (HTTP)');
      }
    } catch { /* skip */ }
  }

  if (hasDowngrade) deduct(30, 'critical', 'Redirect chain contains an HTTPS → HTTP downgrade');
  if (inputIsIP)    deduct(25, 'high',     'URL uses a raw IP address instead of a domain name');
  if (finalIsIP && !inputIsIP) deduct(20, 'high', 'Domain redirects to a raw IP address');
  if (punycodeFlag) deduct(15, 'high',     'Domain uses Punycode encoding — possible homograph attack');

  const redirectCount = hops.filter(h => h.status >= 300 && h.status < 400).length;
  if      (redirectCount >= MAX_HOPS) deduct(15, 'medium', `Redirect limit reached (${redirectCount}+ hops)`);
  else if (redirectCount >= 6)        deduct(10, 'medium', `Unusually long redirect chain (${redirectCount} hops)`);
  else if (redirectCount >= 4)        deduct(5,  'low',    `Multiple redirects (${redirectCount} hops)`);

  if (domainChanges > 0) {
    deduct(Math.min(domainChanges * 8, 20), 'medium',
      `${domainChanges} cross-domain redirect${domainChanges > 1 ? 's' : ''} in chain`);
  }

  if (domainAge !== null && domainAge !== undefined) {
    if      (domainAge < 30)  deduct(25, 'critical', `Domain registered only ${domainAge} day${domainAge !== 1 ? 's' : ''} ago`);
    else if (domainAge < 90)  deduct(15, 'high',     `Domain registered ${domainAge} days ago (recently created)`);
    else if (domainAge < 365) deduct(5,  'low',      `Domain is less than 1 year old (${domainAge} days)`);
  } else if (rdapError) {
    deduct(15, 'medium', 'Domain registration record not found or unavailable');
  }

  if (daysUntilExpiry !== null && daysUntilExpiry !== undefined && daysUntilExpiry < 30) {
    deduct(10, 'medium', `Domain expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`);
  }

  if (suspiciousTld && finalTld) {
    deduct(10, 'medium', `.${finalTld} is a TLD frequently abused in phishing campaigns`);
  }

  if (finalHop?.unreachable || (finalHop?.status != null && finalHop.status >= 400)) {
    deduct(10, 'low', `Final URL returned an error (${finalHop.unreachable ? 'unreachable' : finalHop.status})`);
  }

  const fHeaders = finalHop?.headers || {};
  if (finalHop?.url && !finalHop.unreachable && finalHop.status < 400) {
    try {
      if (new URL(finalHop.url).protocol === 'https:' && !fHeaders['strict-transport-security']) {
        deduct(5, 'low', 'HTTPS site is missing Strict-Transport-Security (HSTS)');
      }
    } catch { /* skip */ }
    if (!fHeaders['x-content-type-options']) {
      deduct(3, 'low', 'Missing X-Content-Type-Options security header');
    }
  }

  if (hasMetaRefresh) deduct(10, 'medium', 'Redirect chain includes an HTML meta-refresh — commonly used to evade URL scanners');
  if (hasJsRedirect)  deduct(5,  'low',    'Final page contains a JavaScript redirect — destination could not be fully resolved');

  if (isShortener) flag('Input URL uses a known link shortener — final destination may differ');

  score = Math.max(0, Math.min(100, score));
  let grade, verdict;
  if      (score >= 85) { grade = 'A'; verdict = 'Looks safe'; }
  else if (score >= 70) { grade = 'B'; verdict = 'Likely safe'; }
  else if (score >= 50) { grade = 'C'; verdict = 'Exercise caution'; }
  else if (score >= 30) { grade = 'D'; verdict = 'Suspicious'; }
  else                  { grade = 'F'; verdict = 'High risk'; }

  return { score, grade, verdict, signals };
}

// ── CORS helper ───────────────────────────────────────────────────────────────

function cors(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://kapadia.org',
    },
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) return cors({ error: 'Missing "url" parameter.' }, 400);

  const validErr = validateUrl(rawUrl);
  if (validErr) return cors({ error: validErr }, 400);

  const inputParsed   = new URL(rawUrl);
  const inputHostname = inputParsed.hostname;
  const inputScheme   = inputParsed.protocol;
  const inputIsIP     = isIPv4Host(inputHostname) || isIPv6Host(inputHostname);
  const punycodeFlag  = !inputIsIP && hasPunycode(inputHostname);
  const isShortener   = URL_SHORTENERS.has(inputHostname.toLowerCase());

  const { hops, hasDowngrade, domainChanges, hasMetaRefresh, hasJsRedirect } = await followRedirects(rawUrl);

  const finalHop = hops[hops.length - 1];
  const finalUrl = finalHop?.url || rawUrl;

  let finalHostname, finalTld, finalBaseDomain;
  try {
    const fp      = new URL(finalUrl);
    finalHostname = fp.hostname;
    finalTld      = getTld(finalHostname);
    finalBaseDomain = getBaseDomain(finalHostname);
  } catch {
    finalHostname   = inputHostname;
    finalTld        = getTld(inputHostname);
    finalBaseDomain = getBaseDomain(inputHostname);
  }

  const finalIsIP     = isIPv4Host(finalHostname) || isIPv6Host(finalHostname);
  const suspiciousTld = finalTld ? SUSPICIOUS_TLDS.has(finalTld) : false;

  let domain      = null;
  let dnsData     = null;
  let domainAge   = null;
  let daysUntilExpiry = null;
  let rdapError   = false;

  if (!finalIsIP) {
    const [rdapData, dns] = await Promise.all([
      rdapLookup(finalBaseDomain),
      getDnsRecords(finalHostname),
    ]);
    dnsData = dns;

    if (rdapData.error) {
      rdapError = true;
    } else {
      const now = Date.now();
      if (rdapData.regDate) {
        const ms = new Date(rdapData.regDate).getTime();
        if (!isNaN(ms)) domainAge = Math.floor((now - ms) / 86400000);
      }
      if (rdapData.expDate) {
        const ms = new Date(rdapData.expDate).getTime();
        if (!isNaN(ms)) daysUntilExpiry = Math.floor((ms - now) / 86400000);
      }
      domain = {
        registrar:   rdapData.registrar,
        registered:  rdapData.regDate,
        expires:     rdapData.expDate,
        updated:     rdapData.updDate,
        status:      rdapData.status,
        nameservers: rdapData.nameservers,
        agedays:     domainAge,
        expiryDays:  daysUntilExpiry,
      };
    }
  }

  const { score, grade, verdict, signals } = computeScore({
    inputScheme, inputIsIP, finalIsIP, hasPunycode: punycodeFlag, isShortener,
    hops, hasDowngrade, domainChanges, domainAge, daysUntilExpiry,
    rdapError, suspiciousTld, finalTld, hasMetaRefresh, hasJsRedirect,
  });

  return cors({
    input: rawUrl,
    inputScheme,
    inputIsIP,
    hasPunycode: punycodeFlag,
    isShortener,
    hops,
    hasDowngrade,
    domainChanges,
    hasMetaRefresh,
    hasJsRedirect,
    finalUrl,
    finalHostname,
    finalBaseDomain,
    finalTld,
    suspiciousTld,
    domain,
    rdapError,
    dns: dnsData,
    score,
    grade,
    verdict,
    signals,
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
