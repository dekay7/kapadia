---
title: Supply Chain Auditor
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 10
---

# Supply Chain Auditor

> [!CAUTION]
> A compromised CDN script can silently steal passwords and payment data from every visitor to a site. In 2024, the Polyfill.io attack did exactly this — to over 100,000 websites — before most developers even noticed.

## What problem does this solve?

94% of websites load third-party JavaScript from content delivery networks (CDNs). Each of those scripts runs with full access to the page — it can read passwords you type, capture credit card numbers, and exfiltrate session tokens. Users and developers both assume that a script loaded over HTTPS from a reputable CDN is safe.

That assumption is wrong.

CDNs get compromised. Maintainers get hacked. Build pipelines get poisoned. And because most websites don't use a security mechanism called **Subresource Integrity (SRI)**, there is no browser-enforced guarantee that the script you receive matches the one the developer intended to serve.

This tool audits any web page and tells you exactly how exposed it is.

## What is Subresource Integrity (SRI)?

SRI is a browser security feature that lets a website declare the expected cryptographic hash of an external resource. A script tag with SRI looks like this:

```html
<script src="https://cdn.example.com/lib.js"
        integrity="sha384-abc123..."></script>
```

If the browser downloads `lib.js` and its SHA-384 hash doesn't match, the browser refuses to execute the script. This stops compromised CDN content cold.

**The problem:** Only a small fraction of websites implement SRI. Most pages load dozens of external scripts with no integrity verification at all.

## What this tool does

Enter any URL. The tool:

1. **Fetches the page** server-side (your browser never contacts it)
2. **Extracts all external scripts and stylesheets** — anything loaded from a different origin
3. **Fetches and hashes each resource** — computing SHA-256 and SHA-512
4. **Validates SRI attributes** — if the page declares an `integrity=` attribute for a resource, the tool checks whether the hash matches
5. **Cross-references npm/cdnjs** — for resources loaded from known CDN patterns (jsDelivr, unpkg, cdnjs), the tool queries the official package registry for the published integrity hash
6. **Runs a consensus check** — each resource is fetched twice; if the two responses differ, that is a tamper signal (non-deterministic responses can indicate active content injection)
7. **Scores risk** — each resource and the overall page receive a risk rating

## Reading the results

### Stat cards

| Card | Meaning |
|------|---------|
| Resources | Total number of unique external scripts and stylesheets found |
| Protected | Resources that have SRI `integrity=` attributes in the HTML |
| Unprotected | Resources loaded with no SRI protection — these could be replaced without browser detection |
| Risk Score | Weighted sum of per-resource risk signals; higher = more exposure |

### Table columns

| Column | Meaning |
|--------|---------|
| Resource | URL of the external script or stylesheet |
| SHA-256 | First 16 characters of the SHA-256 hash of the fetched content |
| SRI | Whether the page HTML declares an `integrity=` attribute for this resource |
| SRI Match | Whether the declared hash matches the hash computed from the fetched content |
| npm | Whether the resource URL matches a known CDN package and whether an integrity hash is available from the registry |
| Risk | Per-resource risk rating based on all signals |

Click any row to expand the full hash values and registry details.

### Risk levels

| Level | Meaning |
|-------|---------|
| **critical** | SRI is declared but the hash does not match — active tampering is possible |
| **high** | No SRI, and the resource returned different content on two separate fetches |
| **medium** | No SRI protection — the resource could be replaced without detection |
| **low** | SRI is present and valid — or all signals are consistent |
| **info** | Not enough data to score (fetch failed, unknown CDN) |

### Sensitivity multiplier

If the page contains a login form or payment form, the overall risk score is multiplied upward (×1.2 for auth, ×1.5 for payment). Compromised scripts on a checkout page are more dangerous than on a blog.

## npm registry cross-reference

For scripts loaded from jsDelivr (`cdn.jsdelivr.net/npm/`), unpkg (`unpkg.com/`), and cdnjs (`cdnjs.cloudflare.com/ajax/libs/`), the tool identifies the package name and version and queries the official registry:

- **cdnjs**: The cdnjs API returns per-file SRI hashes — an exact file-level integrity check
- **jsDelivr / unpkg**: The npm registry returns the tarball integrity hash — this covers the whole package, not the individual file, so it is shown as context rather than a direct match

When the npm column shows **tarball**, it means a registry hash exists but cannot be compared directly to the individual file hash. When it shows **matched** (cdnjs only), the file-level hash was verified against the registry.

## Consensus fetch — why two requests?

Non-deterministic responses are a red flag. A CDN that serves different JavaScript content on different requests may be:

- Injecting malicious code for specific visitors or geographies
- Running A/B testing that swaps scripts (benign but worth knowing)
- Experiencing cache poisoning

If both fetches return identical content, that is one positive signal. A mismatch is flagged with a warning in the expanded row detail.

## Privacy

- The target page and all its external resources are fetched by a **Cloudflare edge function**, not your browser
- Third-party services contacted server-side: Cloudflare DNS-over-HTTPS (SSRF prevention), npm registry, cdnjs API
- No URLs, results, or hashes are logged or stored by kapadia.org
- Your IP address is never forwarded to the target site

## Security design

- **SSRF prevention**: Both the page URL and each extracted resource URL are pre-resolved via DNS-over-HTTPS and checked against private/reserved IP ranges before any fetch
- **Max resources**: 20 external resources per audit (prevents runaway fetch chains)
- **Body cap**: Page HTML capped at 128 KB; resource bodies capped at 256 KB
- **Compression**: All resource fetches request uncompressed content (`Accept-Encoding: identity`) — SRI hashes are always computed on the uncompressed form
- **Error discipline**: Error messages never echo user input back in responses

## API reference

```
GET /api/chain?url=<encoded-url>
```

Returns JSON with the full audit result. Example response shape:

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
  "overall_risk": "medium",
  "resources": [
    {
      "src": "https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js",
      "sha256": "abc123...",
      "sha512": "def456...",
      "sri_expected": null,
      "sri_present": false,
      "sri_match": null,
      "consensus_match": true,
      "npm": {
        "cdn": "jsdelivr",
        "pkg": "jquery",
        "version": "3.7.1",
        "file": "dist/jquery.min.js",
        "integrity": "sha512-...",
        "integrity_type": "tarball"
      },
      "risk": "medium",
      "risk_score": 10,
      "error": null
    }
  ],
  "timestamp": "2026-05-14T00:00:00.000Z"
}
```

CORS is restricted to `https://kapadia.org`. Responses are never cached (`Cache-Control: no-store`).
