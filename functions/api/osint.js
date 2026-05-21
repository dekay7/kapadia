/**
 * GET /api/osint
 * OSINT Digital Footprint Checker — kapadia.org
 *
 * Query params:
 *   mode   = ip | domain | username | email
 *   target = value to investigate (IP address, domain, username, or email)
 *
 * Special target for IP mode:
 *   target=self → automatically uses the connecting IP
 */

import { parseIPv4, isPrivateIPv4, isPrivateIPv6 } from '../lib/ip.js';
import { cors, corsOptions } from '../lib/cors.js';
import { enforceRateLimit } from '../lib/rate-limit.js';

const DOH_BASE = 'https://cloudflare-dns.com/dns-query';
const DEFAULT_HEADERS = { 'User-Agent': 'kapadia.org-osint/1.0 (https://kapadia.org/tools/osint/)' };

const DOH_TIMEOUT_MS      = 4000;
const GEO_TIMEOUT_MS      = 5000;
const RDAP_TIMEOUT_MS     = 5000;
const CERT_TIMEOUT_MS     = 8000;
const PLATFORM_TIMEOUT_MS = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function dohQuery(name, type) {
  try {
    const url = `${DOH_BASE}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.Answer || [];
  } catch {
    return [];
  }
}

function analyzeSPF(spf) {
  if (!spf) return { present: false, strong: false, detail: 'Missing' };
  const isPermissive = spf.includes('+all');     // explicitly allow-all
  const isNeutral    = spf.includes('?all');     // neutral — treated as no policy
  const isSoftfail   = spf.includes('~all');
  const isFail       = spf.includes('-all');

  let detail = 'Unknown';
  if (isPermissive)  detail = 'Permissive (+all)';
  else if (isNeutral)  detail = 'Neutral (?all)';
  else if (isSoftfail) detail = 'Softfail (~all)';
  else if (isFail)     detail = 'Hardfail (-all)';
  else                 detail = 'Present';

  return {
    present: true,
    strong: isFail || isSoftfail,
    detail
  };
}

function analyzeDMARC(dmarc) {
  if (!dmarc) return { present: false, strong: false, policy: 'none (missing)', detail: 'Missing' };

  const pMatch = dmarc.match(/p=([^;]+)/i);
  const policy = pMatch ? pMatch[1].toLowerCase().trim() : 'none';
  const strong = policy === 'reject' || policy === 'quarantine';

  return {
    present: true,
    strong,
    policy,
    detail: `Policy: ${policy}`
  };
}

/**
 * Parse all DMARC tags from a DMARC TXT record string.
 * All values treated as untrusted text — never executed or fetched.
 */
function parseDMARC(record) {
  if (!record) return null;
  // DNS TXT data values are wrapped in double-quotes — strip them before tag parsing
  const r = record.replace(/^"+|"+$/g, '');

  const tag = (name) => {
    const m = r.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  const policy  = (tag('p') || 'none').toLowerCase();
  const sp      = tag('sp');
  const pct     = parseInt(tag('pct') || '100', 10);
  const aspf    = (tag('aspf') || 'r').toLowerCase();
  const adkim   = (tag('adkim') || 'r').toLowerCase();
  const ri      = parseInt(tag('ri') || '86400', 10);
  const fo      = tag('fo') || '0';

  // rua / ruf may contain multiple comma-separated mailto: URIs — return as array of text strings only
  const parseUris = (raw) => raw ? raw.split(',').map(u => u.trim()) : [];
  const rua = parseUris(tag('rua'));
  const ruf = parseUris(tag('ruf'));

  return {
    policy,
    subdomainPolicy: sp ? sp.toLowerCase() : null,
    pct: isNaN(pct) ? 100 : Math.min(100, Math.max(0, pct)),
    aspf,
    adkim,
    ri: isNaN(ri) ? 86400 : ri,
    fo,
    rua,
    ruf,
  };
}

function getSpoofingVerdict(spf, dmarc) {
  const s = analyzeSPF(spf);
  const d = analyzeDMARC(dmarc);

  // A domain is spoofable if:
  // 1. No DMARC record exists
  // 2. DMARC policy is p=none
  // 3. SPF is dangerously permissive (+all)
  const isSpoofable = !d.strong || (s.present && s.detail.includes('+all'));

  return { isSpoofable, spf: s, dmarc: d };
}

/**
 * Count SPF mechanisms that consume a DNS lookup (RFC 7208 §4.6.4).
 * Only counts top-level — does not recursively follow includes (SSRF risk).
 * Returns { count, warning } where warning is null | 'approaching' | 'exceeded'.
 */
function countSPFLookups(spf) {
  if (!spf) return { count: 0, warning: null };
  // Mechanisms that cost a lookup: include, a, mx, ptr, exists, redirect
  const mechanisms = spf.match(/\b(?:include:|a(?::|$)|mx(?::|$)|ptr(?::|$)|exists:|redirect=)/gi) || [];
  const count = mechanisms.length;
  const warning = count > 10 ? 'exceeded' : count >= 8 ? 'approaching' : null;
  return { count, warning };
}

/**
 * Probe common DKIM selectors for a domain.
 * Selector names are hardcoded constants — no user input involved.
 * atob() is wrapped in try/catch to handle malformed base64 in p= values.
 */
async function probeDKIM(domain) {
  const SELECTORS = [
    'default', 'google', 'k1', 'selector1', 'selector2',
    'mail', 'dkim', 'mandrill', 'mailjet', 'pm', 'sendgrid', 'sparkpost',
  ];

  const results = await Promise.allSettled(
    SELECTORS.map(async (selector) => {
      const records = await dohQuery(`${selector}._domainkey.${domain}`, 'TXT');
      const record = records.find(r => r.data && r.data.includes('v=DKIM1'));
      if (!record) return { selector, found: false };

      // Extract key length from p= value using SubtleCrypto to get the true modulus size,
      // bypassing the ~38-byte ASN.1 DER overhead that raw byte-counting includes.
      let keyBits = null;
      const pMatch = record.data.match(/p=([A-Za-z0-9+/=\s]+)/i);
      if (pMatch) {
        const b64 = pMatch[1].replace(/\s/g, '');
        try {
          const keyData = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const cryptoKey = await crypto.subtle.importKey(
            'spki',
            keyData,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            true,
            ['verify'],
          );
          keyBits = cryptoKey.algorithm.modulusLength ?? null;
        } catch {}
      }

      return { selector, found: true, keyBits };
    })
  );

  const found = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value.found) {
      found.push(r.value);
    }
  });

  return { found, checkedCount: SELECTORS.length };
}

// ── Mode: IP Intelligence ─────────────────────────────────────────────────────

async function checkIP(ip, cfData = null) {
  // If we have Cloudflare edge data (for target=self), use it directly
  if (cfData) {
    return {
      ip,
      geo: {
        ip:           ip,
        city:         cfData.city || null,
        region:       cfData.region || null,
        regionCode:   cfData.regionCode || null,
        country:      cfData.countryName || cfData.country || null,
        countryCode:  cfData.country || null,
        postal:       cfData.postalCode || null,
        latitude:     cfData.latitude || null,
        longitude:    cfData.longitude || null,
        timezone:     cfData.timezone || null,
        utcOffset:    null, // Not available in request.cf
        org:          cfData.asOrganization || null,
        asn:          cfData.asn || null,
        languages:    null,
        currency:     null,
      },
      reverseDns:    null, // Will be filled below if possible
      classification: classifyIP(ip)
    };
  }

  // Parallel: geolocation + reverse DNS
  const isV6 = ip.includes(':');
  const ptrDomain = isV6 ? formatIPv6Ptr(ip) : ip.split('.').reverse().join('.') + '.in-addr.arpa';

  const [geoResult, ptrResult] = await Promise.allSettled([
    // Primary: ipwho.is (more reliable for Cloudflare Workers)
    fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    }),
    dohQuery(ptrDomain, 'PTR'),
  ]);

  const isTimedOut = (r) => r.name === 'TimeoutError' || r.name === 'AbortError';

  // Geolocation Mapping (ipwho.is)
  let geo = null;
  let geoTimedOut = geoResult.status === 'rejected' && isTimedOut(geoResult.reason);
  if (geoResult.status === 'fulfilled' && geoResult.value.ok) {
    try {
      const raw = await geoResult.value.json();
      if (raw.success) {
        geo = {
          ip:           raw.ip,
          city:         raw.city || null,
          region:       raw.region || null,
          regionCode:   raw.region_code || null,
          country:      raw.country || null,
          countryCode:  raw.country_code || null,
          postal:       raw.postal || null,
          latitude:     raw.latitude || null,
          longitude:    raw.longitude || null,
          timezone:     raw.timezone?.id || null,
          utcOffset:    raw.timezone?.utc || null,
          org:          raw.connection?.org || null,
          asn:          raw.connection?.asn || null,
          languages:    raw.languages || null,
          currency:     raw.currency || null,
        };
      }
    } catch { /* fallback to next service if we had one */ }
  }

  // Fallback to ipapi.co if primary failed
  if (!geo) {
    try {
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
      });
      if (res.ok) {
        const raw = await res.json();
        if (!raw.error) {
          geoTimedOut = false;
          geo = {
            ip:           raw.ip,
            city:         raw.city || null,
            region:       raw.region || null,
            regionCode:   raw.region_code || null,
            country:      raw.country_name || null,
            countryCode:  raw.country_code || null,
            postal:       raw.postal || null,
            latitude:     raw.latitude || null,
            longitude:    raw.longitude || null,
            timezone:     raw.timezone || null,
            utcOffset:    raw.utc_offset || null,
            org:          raw.org || null,
            asn:          raw.asn || null,
            languages:    raw.languages || null,
            currency:     raw.currency || null,
          };
        }
      }
    } catch (err) {
      if (isTimedOut(err)) geoTimedOut = true;
    }
  }

  // Reverse DNS (PTR)
  let reverseDns = null;
  if (ptrResult.status === 'fulfilled' && ptrResult.value.length > 0) {
    reverseDns = ptrResult.value[0].data.replace(/\.$/, '');
  }

  return { ip, geo, geoTimedOut, reverseDns, classification: classifyIP(ip) };
}

/** Formats an IPv6 address for reverse DNS lookup (ip6.arpa). */
function formatIPv6Ptr(ip) {
  // Simple expansion and reversal for standard IPv6
  // Note: This is a simplified version; complex compressed IPs might need more robust expansion
  try {
    const full = ip.includes('::') ? expandIPv6(ip) : ip;
    return full.split(':').join('').split('').reverse().join('.') + '.ip6.arpa';
  } catch {
    return '';
  }
}

function expandIPv6(ip) {
  const parts = ip.split('::');
  let left = parts[0].split(':').filter(x => x !== '');
  let right = (parts[1] || '').split(':').filter(x => x !== '');
  const missing = 8 - (left.length + right.length);
  const mid = new Array(missing).fill('0000');

  const all = [...left, ...mid, ...right].map(p => p.padStart(4, '0'));
  return all.join(':');
}

function classifyIP(ip) {
  const o = parseIPv4(ip);
  if (o) {
    const [a, b] = o;
    if (a === 255) return 'broadcast';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
    if (a === 0) return 'unspecified';
    if (isPrivateIPv4(o)) return 'private';
    return 'public';
  }
  if (isPrivateIPv6(ip)) return 'private';
  return 'public';
}

// ── Mode: Domain Footprint ────────────────────────────────────────────────────

async function checkDomain(domain) {
  const dnsTypes = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'];

  const [dnsResult, rdapResult, certsResult, dmarcResult] = await Promise.allSettled([
    // All DNS record types in parallel
    Promise.all(
      dnsTypes.map(async (type) => {
        const records = await dohQuery(domain, type);
        return {
          type,
          records: records.map(r => ({ ttl: r.TTL, data: r.data, name: r.name })),
        };
      })
    ),

    // RDAP (WHOIS replacement)
    fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { ...DEFAULT_HEADERS, Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    }),

    // Certificate transparency (subdomains via crt.sh)
    fetch(
      `https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`,
      { headers: { ...DEFAULT_HEADERS, Accept: 'application/json' }, signal: AbortSignal.timeout(CERT_TIMEOUT_MS) }
    ),

    // DMARC record (specifically)
    dohQuery(`_dmarc.${domain}`, 'TXT'),
  ]);

  // ── DNS
  const dns = {};
  if (dnsResult.status === 'fulfilled') {
    dnsResult.value.forEach(({ type, records }) => {
      if (records.length > 0) dns[type] = records;
    });
  }

  // Extract useful parsed values
  const spf   = dns.TXT?.find(r => r.data.includes('v=spf1'))?.data || null;

  // DMARC records must be at _dmarc.<domain> per RFC 7489 — do not check root TXT
  let dmarc = null;
  if (dmarcResult.status === 'fulfilled') {
    dmarc = dmarcResult.value.find(r => r.data.includes('v=DMARC1'))?.data || null;
  }

  const security = getSpoofingVerdict(spf, dmarc);

  // ── RDAP
  let rdap = null;
  if (rdapResult.status === 'fulfilled' && rdapResult.value.ok) {
    try {
      const raw = await rdapResult.value.json();

      const registrar = raw.entities
        ?.find(e => e.roles?.includes('registrar'))
        ?.vcardArray?.[1]
        ?.find(f => f[0] === 'fn')?.[3] || null;

      const registrant = raw.entities
        ?.find(e => e.roles?.includes('registrant'))
        ?.vcardArray?.[1]
        ?.find(f => f[0] === 'org')?.[3] || null;

      const events = (raw.events || []).reduce((acc, e) => {
        acc[e.eventAction] = e.eventDate;
        return acc;
      }, {});

      rdap = {
        registrar,
        registrant,
        status:      raw.status || [],
        nameservers: (raw.nameservers || []).map(ns => ns.ldhName?.toLowerCase()),
        events,
        handle:      raw.handle || null,
        port43:      raw.port43 || null,
      };
    } catch { /* swallow */ }
  }

  const isTimedOut = (r) => r?.name === 'TimeoutError' || r?.name === 'AbortError';
  const rdapTimedOut = rdapResult.status === 'rejected' && isTimedOut(rdapResult.reason);

  // ── Certificate transparency
  let subdomains = [];
  let certCount  = 0;
  const subdomainsTimedOut = certsResult.status === 'rejected' && isTimedOut(certsResult.reason);
  if (certsResult.status === 'fulfilled' && certsResult.value.ok) {
    try {
      const certs = await certsResult.value.json();
      certCount   = certs.length;

      const seen = new Set();
      certs.forEach(cert => {
        const names = (cert.name_value || '').split('\n');
        names.forEach(raw => {
          const name = raw.replace(/^\*\./, '').trim().toLowerCase();
          if (
            name.endsWith(`.${domain}`) ||
            name === domain
          ) {
            if (!seen.has(name)) {
              seen.add(name);
              subdomains.push({
                name,
                issuer:    cert.issuer_name,
                notBefore: cert.not_before,
                notAfter:  cert.not_after,
              });
            }
          }
        });
      });

      subdomains.sort((a, b) => a.name.localeCompare(b.name));
      subdomains = subdomains.slice(0, 40);
    } catch { /* swallow */ }
  }

  return {
    dns,
    rdap,
    rdapTimedOut,
    spf,
    dmarc,
    isSpoofable: security.isSpoofable,
    spfStatus:   security.spf.detail,
    dmarcStatus: security.dmarc.detail,
    subdomains,
    certCount,
    subdomainsTimedOut,
  };
}

// ── Mode: Username Lookup ─────────────────────────────────────────────────────

async function checkUsername(username) {
  const platforms = [
    {
      id:         'github',
      label:      'GitHub',
      apiUrl:     `https://api.github.com/users/${encodeURIComponent(username)}`,
      profileUrl: `https://github.com/${username}`,
      async parse(res) {
        if (!res.ok) return { found: false };
        const j = await res.json();
        return {
          found: true,
          data: {
            name:     j.name     || null,
            bio:      j.bio      || null,
            repos:    j.public_repos,
            gists:    j.public_gists,
            followers: j.followers,
            following: j.following,
            created:  j.created_at?.substring(0, 10),
            updated:  j.updated_at?.substring(0, 10),
            location: j.location || null,
            blog:     j.blog     || null,
            company:  j.company  || null,
            hireable: j.hireable || null,
            twitter:  j.twitter_username || null,
          },
        };
      },
    },
    {
      id:         'gitlab',
      label:      'GitLab',
      apiUrl:     `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}&per_page=1`,
      profileUrl: `https://gitlab.com/${username}`,
      async parse(res) {
        if (!res.ok) return { found: false };
        const j = await res.json();
        if (!Array.isArray(j) || j.length === 0) return { found: false };
        return {
          found: true,
          data: {
            name:    j[0].name    || null,
            bio:     j[0].bio     || null,
            website: j[0].website_url || null,
            created: j[0].created_at?.substring(0, 10),
          },
        };
      },
    },
    {
      id:         'hackernews',
      label:      'Hacker News',
      apiUrl:     `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`,
      profileUrl: `https://news.ycombinator.com/user?id=${username}`,
      async parse(res) {
        if (!res.ok) return { found: false };
        const j = await res.json();
        if (j === null) return { found: false };
        return {
          found: true,
          data: {
            karma:   j.karma,
            created: j.created ? new Date(j.created * 1000).toISOString().substring(0, 10) : null,
            about:   j.about ? j.about.replace(/<[^>]*>/g, '').replace(/</g, '').substring(0, 200) : null,
          },
        };
      },
    },
    {
      id:         'dockerhub',
      label:      'Docker Hub',
      apiUrl:     `https://hub.docker.com/v2/users/${encodeURIComponent(username)}/`,
      profileUrl: `https://hub.docker.com/u/${username}`,
      async parse(res) {
        if (!res.ok) return { found: false };
        const j = await res.json();
        return {
          found: true,
          data: {
            fullName: j.full_name || null,
            company:  j.company  || null,
            location: j.location || null,
            joined:   j.date_joined?.substring(0, 10),
          },
        };
      },
    },
    {
      id:         'npm',
      label:      'npm',
      apiUrl:     `https://registry.npmjs.org/-/user/org.couchdb.user:${encodeURIComponent(username)}`,
      profileUrl: `https://www.npmjs.com/~${encodeURIComponent(username)}`,
      async parse(res) {
        if (res.status === 404) return { found: false };
        if (!res.ok)            return { found: false };
        try {
          const j = await res.json();
          // npm's CouchDB registry may expose the account email publicly;
          // we surface it here only because the subject made it public on npm.
          return {
            found: true,
            data: { email: j.email || null },
          };
        } catch {
          return { found: true, data: null };
        }
      },
    },
  ];

  const results = await Promise.allSettled(
    platforms.map(async (p) => {
      const res = await fetch(p.apiUrl, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS) });
      const { found, data } = await p.parse(res);
      return { id: p.id, label: p.label, found, data, profileUrl: p.profileUrl };
    })
  );

  const isTimedOut = (r) => r?.name === 'TimeoutError' || r?.name === 'AbortError';

  const output = {};
  results.forEach((r, i) => {
    const { id, label, profileUrl } = platforms[i];
    if (r.status === 'fulfilled') {
      output[id] = { label, found: r.value.found, data: r.value.data, profileUrl };
    } else {
      const timedOut = isTimedOut(r.reason);
      output[id] = { label, found: false, data: null, profileUrl, timedOut, error: timedOut ? 'timeout' : 'request failed' };
    }
  });

  return { username, platforms: output };
}

// ── Mode: Email Footprint ─────────────────────────────────────────────────────

async function checkEmail(email) {
  const atIdx = email.indexOf('@');
  if (atIdx < 1) throw new Error('Invalid email format');

  const localPart = email.substring(0, atIdx);
  const domain    = email.substring(atIdx + 1).toLowerCase().trim();

  if (!domain || !domain.includes('.')) throw new Error('Invalid email domain');

  // All DNS lookups in parallel — DNS-only, no SSRF risk
  const [mxRecords, aRecords, txtRecords, dmarcRecords, mtaStsRecords, tlsRptRecords, bimiRecords, dkimResult] = await Promise.all([
    dohQuery(domain, 'MX'),
    dohQuery(domain, 'A'),
    dohQuery(domain, 'TXT'),
    dohQuery(`_dmarc.${domain}`, 'TXT'),
    dohQuery(`_mta-sts.${domain}`, 'TXT'),
    dohQuery(`_smtp._tls.${domain}`, 'TXT'),
    dohQuery(`default._bimi.${domain}`, 'TXT'),
    probeDKIM(domain),
  ]);

  const mx = mxRecords.map(r => ({
    priority: parseInt(r.data.split(' ')[0], 10),
    exchange: r.data.split(' ')[1]?.replace(/\.$/, ''),
    ttl:      r.TTL,
  })).sort((a, b) => a.priority - b.priority);

  const spf   = txtRecords.find(r => r.data.includes('v=spf1'))?.data   || null;
  const dmarc = dmarcRecords.find(r => r.data.includes('v=DMARC1'))?.data || null;

  // MTA-STS: presence check only — do NOT fetch the policy file (SSRF risk)
  const mtaStsTxt = mtaStsRecords.find(r => r.data.includes('v=STSv1'));
  const mtaSts = { present: !!mtaStsTxt };

  // TLS-RPT
  const tlsRptTxt = tlsRptRecords.find(r => r.data.includes('v=TLSRPTv1'));
  const tlsRpt = { present: !!tlsRptTxt };

  // BIMI
  const bimiTxt = bimiRecords.find(r => r.data.includes('v=BIMI1'));
  const bimi = { present: !!bimiTxt, record: bimiTxt ? bimiTxt.data : null };

  // Infer mail provider from MX
  const mailProvider = inferMailProvider(mx);

  // SPF lookup count — regex-based count only, no recursive following
  const spfLookups = countSPFLookups(spf);

  // Full DMARC tag parsing
  const dmarcParsed = parseDMARC(dmarc);

  // Basic disposable domain check
  const disposableDomains = new Set([
    'mailinator.com', 'guerrillamail.com', 'temp-mail.org', 'throwam.com',
    'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
    'spam4.me', 'yopmail.com', 'fakeinbox.com', 'trashmail.com',
    'tempmail.com', 'dispostable.com', 'mailnull.com', '10minutemail.com',
    'maildrop.cc', 'mailnesia.com', 'spamgourmet.com', 'trashmail.at',
    'trashmail.io', 'trashmail.me', 'throwam.com', 'discard.email',
    'spamhereplease.com', 'emailondeck.com', 'spambox.us', 'getonemail.com',
    'mailexpire.com', 'spamfree24.org', 'mailnew.com', 'fakemail.net',
    'mailseal.de', 'spamgap.com', 'trashmail.net', 'trashmail.xyz',
    'mailzilla.org', 'throwam.net', 'spamex.com', 'spamhole.com',
    'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'filzmail.com',
    'throwmail.com', 'mintemail.com', 'spamgourmet.net', 'bugmenot.com',
    'spamcorptastic.com', 'spamoverlord.com', 'spamstack.net',
  ]);
  const isDisposable = disposableDomains.has(domain);

  // Detect if it's a free consumer email provider
  const freeProviders = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
  ]);
  const isFreeProvider = freeProviders.has(domain);

  // Detect spoofability with robust logic
  const security = getSpoofingVerdict(spf, dmarc);

  return {
    email,
    localPart,
    domain,
    mx,
    spf,
    dmarc,
    mailProvider,
    isDisposable,
    isFreeProvider,
    isSpoofable:       security.isSpoofable,
    spfStatus:         security.spf.detail,
    dmarcStatus:       security.dmarc.detail,
    hasMailRecords:    mx.length > 0,
    hasSPF:            spf !== null,
    hasDMARC:          dmarc !== null,
    domainHasWebsite:  aRecords.length > 0,
    // New enhanced fields
    dkim:              dkimResult,
    spfLookupCount:    spfLookups.count,
    spfLookupWarning:  spfLookups.warning,
    dmarcParsed,
    mtaSts,
    tlsRpt,
    bimi,
  };
}

function inferMailProvider(mxRecords) {
  if (!mxRecords.length) return null;
  const hosts = mxRecords.map(r => (r.exchange || '').toLowerCase());
  const check = h => hosts.some(x => x.includes(h));

  if (check('google') || check('gmail'))     return 'Google Workspace / Gmail';
  if (check('outlook') || check('microsoft') || check('hotmail')) return 'Microsoft 365 / Outlook';
  if (check('yahoo'))                         return 'Yahoo Mail';
  if (check('protonmail') || check('proton')) return 'Proton Mail';
  if (check('zoho'))                          return 'Zoho Mail';
  if (check('mxroute'))                       return 'MXroute';
  if (check('fastmail'))                      return 'Fastmail';
  if (check('icloud') || check('apple'))      return 'Apple iCloud Mail';
  if (check('mailgun'))                       return 'Mailgun';
  if (check('sendgrid'))                      return 'SendGrid';
  if (check('amazonses') || check('aws'))     return 'Amazon SES';
  return null;
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export async function onRequestGet(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await enforceRateLimit(env, 'osint', ip);
  if (limited) return limited;

  const url    = new URL(request.url);
  const mode   = url.searchParams.get('mode')   || '';
  const target = url.searchParams.get('target') || '';

  if (!mode || !target) {
    return cors({ error: 'Missing required parameters: mode and target' }, 400);
  }

  const validModes = ['ip', 'domain', 'username', 'email'];
  if (!validModes.includes(mode)) {
    return cors({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400);
  }

  try {
    let data;

    switch (mode) {
      case 'ip': {
        let resolvedIP = target;
        let cfData = null;

        if (target === 'self') {
          resolvedIP = request.headers.get('cf-connecting-ip');
          cfData = request.cf; // Use Cloudflare's native edge metadata
          if (!resolvedIP) {
            resolvedIP = '127.0.0.1';
          }
        }

        // IP format validation — parseIPv4 enforces 0-255 range per octet;
        // IPv6 is validated by attempting to parse it as a URL host bracket.
        const ipv4 = parseIPv4(resolvedIP) !== null;
        const ipv6 = (() => { try { new URL(`http://[${resolvedIP}]`); return true; } catch { return false; } })();
        if (!ipv4 && !ipv6) {
          return cors({ error: 'Invalid IP address format.' }, 400);
        }

        data = await checkIP(resolvedIP, cfData);
        break;
      }

      case 'domain': {
        const domainClean = target.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(domainClean)) {
          return cors({ error: 'Invalid domain format' }, 400);
        }
        data = await checkDomain(domainClean);
        break;
      }

      case 'username': {
        const clean = target.trim();
        if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(clean)) {
          return cors({ error: 'Invalid username format (alphanumeric, hyphens, underscores, dots; max 64 chars)' }, 400);
        }
        data = await checkUsername(clean);
        break;
      }

      case 'email': {
        const emailClean = target.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
          return cors({ error: 'Invalid email address format' }, 400);
        }
        data = await checkEmail(emailClean);
        break;
      }
    }

    return cors({ mode, target, timestamp: new Date().toISOString(), data });

  } catch (err) {
    return cors({ error: 'Internal error during OSINT check.' }, 500);
  }
}

export { corsOptions as onRequestOptions };
