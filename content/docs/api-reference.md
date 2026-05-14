---
title: API Reference
breadcrumb: docs / reference
sidebar_section: Technical Reference
sidebar_order: 0
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
