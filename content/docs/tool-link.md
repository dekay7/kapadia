---
title: Link Inspector
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 1
---

# Link Inspector

> [!TIP]
> Paste any URL — including shortened links — to trace exactly where it goes and assess its safety before clicking.

## What is a Link Inspector?

Have you ever received a text or email with a shortened link and wondered if it's safe to click? A **Link Inspector** follows that link for you in a safe environment, seeing exactly where it leads without you having to visit the site yourself.

## What is this tool for?

This tool acts as a "shield." It follows a link through all its twists and turns (redirects) and analyzes the final destination. It looks for red flags—like very new websites, lack of security encryption, or suspicious settings—and gives the link a "safety score" so you can decide if it's safe to open in your own browser.

## What It Does

The Link Inspector traces the full redirect chain for a URL, checks domain registration age and reputation, and produces a **safety score (0–100)** with a letter grade (A–F). All fetching happens on Cloudflare's edge network — your browser never contacts the target URL.

---

## Scoring System

The score starts at **100** and deductions are applied for each risk signal detected:

| Signal | Deduction |
|---|---|
| Input URL uses HTTP | −20 |
| Final destination uses HTTP | −20 |
| HTTPS → HTTP downgrade in redirect chain | −30 |
| Raw IP address as hostname | −25 |
| Domain redirects to a raw IP address | −20 |
| Punycode / IDN domain (possible homograph attack) | −15 |
| 4–5 redirects | −5 |
| 6–9 redirects | −10 |
| 10+ redirects (limit reached) | −15 |
| Cross-domain redirect (per hop, max −20 total) | −8 |
| Domain registered < 30 days ago | −25 |
| Domain registered 30–90 days ago | −15 |
| Domain registered 90–365 days ago | −5 |
| Domain expiring within 30 days | −10 |
| No RDAP registration record found | −15 |
| Suspicious or high-abuse TLD | −10 |
| Final URL unreachable (4xx/5xx) | −10 |
| HTML meta-refresh redirect in chain | −10 |
| Missing HSTS header (HTTPS site) | −5 |
| Missing X-Content-Type-Options | −3 |
| JavaScript redirect on final page | −5 |

### Grades

| Score | Grade | Verdict |
|---|---|---|
| 85–100 | A | Looks safe |
| 70–84 | B | Likely safe |
| 50–69 | C | Exercise caution |
| 30–49 | D | Suspicious |
| 0–29 | F | High risk |

---

## Results Sections

### Security Signals
Every deduction applied, with its risk level (critical / high / medium / low) and the point penalty. Informational flags (no deduction) also appear here — for example, if the input URL uses a known link shortener.

### Redirect Chain
A step-by-step list of every hop with its HTTP status code. Up to three inline markers may appear on a hop:
- **domain change** — the redirect crosses to a different registrable domain
- **HTTPS downgrade** — the redirect goes from HTTPS to HTTP (a serious red flag)
- **meta-refresh** — the redirect was triggered by an HTML `<meta http-equiv="refresh">` tag rather than an HTTP 3xx response (commonly used to evade URL scanners)

### Domain Intelligence
RDAP registration data for the final destination:
- Registrar, registration date, age, and expiry
- RDAP status flags (e.g. *clientTransferProhibited*)
- Name servers
- DNS A / AAAA records

### Response Headers
Key HTTP response headers from the final destination, colour-coded for security relevance:
- **HSTS** — whether the site enforces HTTPS for future visits (green if present)
- **X-Frame-Options** — clickjacking protection
- **X-Content-Type-Options** — MIME-type sniffing protection (green if present)
- **CSP** — Content Security Policy presence indicator (green if present)
- **Referrer-Policy**, **Permissions-Policy**, server fingerprinting headers, and more

---

## Privacy

- URLs are fetched by the **edge network**, not your browser
- No URLs, results, or request metadata are logged or stored
- Fetches to the URL under inspection use a **Chrome-mimicking User-Agent** to defeat trivial bot-detection that might otherwise hide redirect chains from automated tools
- Internal service lookups (RDAP, DoH) use a distinct `kapadia.org-link/1.0` User-Agent

---

## Security Design

The edge function applies strict mitigations before contacting any URL:

1. **Scheme restriction** — only `http:` and `https:` are accepted; `file:`, `ftp:`, `data:`, and all others are rejected
2. **Hostname blocklist** — localhost, cloud metadata endpoints (169.254.169.254, etc.), and other reserved names are blocked
3. **Private IP guard** — raw IP addresses in RFC 1918, loopback, link-local, CGNAT, and reserved ranges are rejected immediately
4. **DoH pre-resolution** — every hostname is resolved via Cloudflare DoH before a fetch is made; all returned A/AAAA records are checked against the private-IP blocklist
5. **Per-hop re-validation** — each URL encountered during redirect following is independently validated (scheme + SSRF guard) before it is fetched
6. **Body peek** — up to 16 KB of HTML is read from the final response to detect `<meta http-equiv="refresh">` and JavaScript redirect patterns; the rest of the body is discarded
7. **Cookie jar** — session and redirect cookies are maintained per base-domain across hops (like a real browser would) to accurately follow chains that depend on cookies
8. **Redirect limit** — maximum 10 hops
9. **Timeout** — 8 seconds per hop; the total wall-clock time is bounded

---

## API Reference

```bash
GET /api/link?url=<encoded-url>
```

### Example

```bash
curl "https://kapadia.org/api/link?url=https%3A%2F%2Fexample.com"
```

### Response envelope

```json
{
  "input": "https://bit.ly/abc123",
  "inputScheme": "https:",
  "inputIsIP": false,
  "hasPunycode": false,
  "isShortener": true,
  "hops": [
    { "url": "https://bit.ly/abc123", "status": 301, "location": "https://example.com/", "domainChanged": true },
    { "url": "https://example.com/",  "status": 200, "headers": { "strict-transport-security": "max-age=31536000", "x-content-type-options": "nosniff" } }
  ],
  "hasDowngrade": false,
  "hasMetaRefresh": false,
  "hasJsRedirect": false,
  "domainChanges": 1,
  "finalUrl": "https://example.com/",
  "finalHostname": "example.com",
  "finalBaseDomain": "example.com",
  "finalTld": "com",
  "suspiciousTld": false,
  "domain": {
    "registrar": "RESERVED-Internet Assigned Numbers Authority",
    "registered": "1995-08-14T04:00:00Z",
    "expires": "2025-08-13T04:00:00Z",
    "agedays": 10772,
    "expiryDays": 93,
    "status": ["client delete prohibited"],
    "nameservers": ["a.iana-servers.net", "b.iana-servers.net"]
  },
  "rdapError": false,
  "dns": { "a": ["93.184.216.34"], "aaaa": ["2606:2800:220:1:248:1893:25c8:1946"] },
  "score": 87,
  "grade": "A",
  "verdict": "Looks safe",
  "signals": [
    { "level": "info", "reason": "Input URL uses a known link shortener — final destination may differ", "deduction": 0 }
  ]
}
```

### Error responses

| HTTP Status | Meaning |
|---|---|
| 400 | Invalid or disallowed URL (bad scheme, private IP, blocked host, malformed) |
| 200 | Success — inspect `score`, `grade`, `verdict`, and `signals` |

CORS is restricted to `https://kapadia.org`. Responses are never cached (`Cache-Control: no-store`).
