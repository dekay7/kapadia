---
title: API Reference
breadcrumb: docs / reference
sidebar_section: Technical Reference
---

# API Reference

The kapadia.org API provides programmatic access to visitor data, network metrics, and OSINT intelligence.

## GET /api/info

Returns your current IP address and geographic metadata provided by the global edge network.

### Example Response

```json
{
  "ipv4": "203.0.113.42",
  "ipv6": null,
  "country": "US",
  "countryName": "United States",
  "city": "Chicago",
  "region": "Illinois",
  "regionCode": "IL",
  "postalCode": "60601",
  "timezone": "America/Chicago",
  "latitude": 41.8827,
  "longitude": -87.6233,
  "asn": 13335,
  "asOrganization": "Cloudflare, Inc.",
  "colo": "ORD"
}
```

### Technical Notes

- **CORS**: Enabled (`https://kapadia.org`), restricted to this origin for security.
- **Caching**: Disabled (`no-store`) to ensure current data.

---

## GET /api/osint

Open-source intelligence endpoint. Investigates an IP address, domain, username, or email address using public data sources, all via the global edge network.

### Parameters

| Parameter | Required | Values |
|---|---|---|
| `mode` | Yes | `ip`, `domain`, `username`, `email` |
| `target` | Yes | The value to investigate. Pass `self` with `mode=ip` to inspect your own IP. |

### Example Requests

```bash
# Your own IP
curl "https://kapadia.org/api/osint?mode=ip&target=self"

# Specific IP
curl "https://kapadia.org/api/osint?mode=ip&target=8.8.8.8"

# Domain
curl "https://kapadia.org/api/osint?mode=domain&target=example.com"

# Username
curl "https://kapadia.org/api/osint?mode=username&target=torvalds"

# Email
curl "https://kapadia.org/api/osint?mode=email&target=user@example.com"
```

### Response Envelope

```json
{
  "mode": "ip",
  "target": "8.8.8.8",
  "timestamp": "2025-05-11T16:00:00.000Z",
  "data": { ... }
}
```

### Email Mode Response Fields

The email mode returns a comprehensive set of DNS-derived security fields:

```json
{
  "email": "user@example.com",
  "localPart": "user",
  "domain": "example.com",
  "mx": [{ "priority": 10, "exchange": "mail.example.com", "ttl": 3600 }],
  "mailProvider": "Google Workspace / Gmail",
  "hasMailRecords": true,
  "hasSPF": true,
  "hasDMARC": true,
  "isFreeProvider": false,
  "isDisposable": false,
  "isSpoofable": false,
  "spf": "v=spf1 include:_spf.google.com -all",
  "spfStatus": "Hardfail (-all)",
  "spfLookupCount": 3,
  "spfLookupWarning": null,
  "dmarc": "v=DMARC1; p=reject; rua=mailto:reports@example.com",
  "dmarcStatus": "Policy: reject",
  "dmarcParsed": {
    "policy": "reject",
    "subdomainPolicy": null,
    "pct": 100,
    "aspf": "r",
    "adkim": "r",
    "rua": ["mailto:reports@example.com"],
    "ruf": [],
    "ri": 86400,
    "fo": "0"
  },
  "dkim": {
    "found": [
      { "selector": "google", "keyBits": 2048, "record": "v=DKIM1; k=rsa; p=..." }
    ],
    "checkedCount": 12
  },
  "mtaSts": { "present": true },
  "tlsRpt": { "present": true },
  "bimi":   { "present": false, "record": null },
  "domainHasWebsite": true
}
```

**`spfLookupWarning`** — `null` (safe), `"approaching"` (8–10 lookups), or `"exceeded"` (>10 lookups, RFC 7208 violation).

See the [OSINT Footprint documentation](#tool-osint) for full field descriptions and data source attribution.

---

## GET /api/link

Traces the redirect chain for a URL and returns domain intelligence, response headers, and a safety score. All external fetching happens server-side — the caller's browser never contacts the target.

### Parameters

| Parameter | Required | Description |
|---|---|---|
| `url` | Yes | The URL to inspect (URL-encoded) |

### Example Request

```bash
curl "https://kapadia.org/api/link?url=https%3A%2F%2Fexample.com"
```

See the [Link Inspector documentation](#tool-link) for the full response schema and scoring breakdown.

---

## GET /api/dns

Resolves DNS records for a given domain using a secure DNS-over-HTTPS (DoH) resolver.

### Parameters

| Parameter | Required | Description |
|---|---|---|
| `domain` | Yes | The domain to look up |

### Example Response

```json
{
  "A":  [{ "name": "example.com.", "ttl": 3600, "data": "93.184.216.34" }],
  "MX": [{ "name": "example.com.", "ttl": 3600, "data": "10 mail.example.com." }]
}
```

### Technical Notes

- **CORS**: Enabled (`https://kapadia.org`).
- **Caching**: Disabled (`no-store`).

---

## GET /api/leak

Dumps the HTTP request headers and Cloudflare TLS connection properties as seen by the edge. Used by the Browser Fingerprint tool to expose what your browser reveals at the network layer.

No parameters.

### Example Response

```json
{
  "httpProtocol": "HTTP/2",
  "tlsCipher": "AEAD-AES128-GCM-SHA256",
  "tlsVersion": "TLSv1.3",
  "clientTcpRtt": 12,
  "ip": "203.0.113.42",
  "colo": "ORD",
  "headers": {
    "accept": "text/html,application/xhtml+xml,...",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 ..."
  }
}
```

### Technical Notes

- **Filtered headers**: `authorization`, `cookie`, `cf-access-jwt-assertion`, and `cf-access-token` are stripped before the response is returned.
- **CORS**: Enabled (`https://kapadia.org`).
- **Caching**: Disabled (`no-store`).

---

## GET /api/chain

Supply chain audit endpoint. Fetches a page's HTML server-side, extracts all cross-origin scripts and stylesheets, and evaluates each one for SRI coverage, hash integrity, npm registry cross-reference, and consensus across two independent fetches.

### Parameters

| Parameter | Required | Description |
|---|---|---|
| `url` | Yes | The page URL to audit (URL-encoded) |

### Example Request

```bash
curl "https://kapadia.org/api/chain?url=https%3A%2F%2Fexample.com"
```

### Top-Level Response Fields

```json
{
  "url": "https://example.com",
  "fetched_url": "https://example.com/",
  "truncated": false,
  "resource_count": 3,
  "unprotected_count": 2,
  "has_auth_form": false,
  "has_payment_form": false,
  "overall_score": 20,
  "overall_risk": "high",
  "timestamp": "2025-05-11T16:00:00.000Z",
  "resources": [ ... ]
}
```

| Field | Description |
|---|---|
| `truncated` | `true` if the page HTML exceeded 128 KB and was cut off before parsing |
| `unprotected_count` | Number of cross-origin resources loaded without any SRI hash |
| `has_auth_form` | `true` if the page contains a password or email input — raises the overall risk multiplier |
| `has_payment_form` | `true` if the page contains payment-related keywords — raises the overall risk multiplier further |
| `overall_score` | Numeric aggregate risk score across all resources (higher = riskier) |
| `overall_risk` | `"low"`, `"medium"`, `"high"`, or `"critical"` |

### Per-Resource Object

Each entry in `resources` contains:

```json
{
  "src": "https://cdn.example.com/lib.js",
  "sha256": "a1b2c3...",
  "sha256b64": "obLD...",
  "sha512": "d4e5f6...",
  "sha512b64": "1K3m...",
  "sri_expected": "sha256-obLD...",
  "sri_present": true,
  "sri_match": true,
  "consensus_match": true,
  "npm": {
    "cdn": "jsdelivr",
    "pkg": "some-lib",
    "version": "1.2.3",
    "file": "dist/lib.min.js",
    "integrity": "sha512-...",
    "integrity_type": "tarball"
  },
  "risk": "low",
  "risk_score": 0,
  "error": null
}
```

| Field | Description |
|---|---|
| `sri_present` | Whether the page HTML included an `integrity` attribute for this resource |
| `sri_match` | `true` if the fetched file matches the declared SRI hash; `false` if it doesn't; `null` if no SRI was declared |
| `consensus_match` | `true` if two independent fetches returned identical content; `false` if the content changed between fetches (possible tampering); `null` if the second fetch failed |
| `npm` | npm/CDN registry metadata for jsDelivr, unpkg, and cdnjs resources; `null` for other origins |
| `risk` | Per-resource risk level: `"low"`, `"medium"`, `"high"`, `"critical"`, or `"unknown"` |
| `error` | `null` on success; a string describing why analysis failed (e.g., `"fetch_failed"`) |

### Technical Notes

- **SSRF prevention**: Both the target page URL and every extracted resource URL are validated for scheme and checked against private/reserved IP ranges via DoH pre-resolution.
- **Limits**: Up to 20 cross-origin resources are analyzed. The page HTML is capped at 128 KB; each resource body is capped at 256 KB.
- **Same-origin resources are excluded**: Only cross-origin scripts and stylesheets are audited.
- **CORS**: Enabled (`https://kapadia.org`).
- **Caching**: Disabled (`no-store`).
