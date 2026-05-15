---
title: OSINT Footprint Checker
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 2
sidebar_label: OSINT Footprint
---

# OSINT Footprint Checker

> [!NOTE]
> All lookups run through a secure edge function. No queries, targets, or results are logged or persisted.

## What is OSINT?

**OSINT** stands for Open-Source Intelligence. It refers to the practice of collecting and analyzing information that is publicly available. Just like a detective gathering clues from public records, OSINT helps you piece together a digital picture of an IP address, a domain, or a username.

## What is this tool for?

This tool helps you investigate "digital footprints." You can use it to:
- See the physical location and owner of an **IP address**.
- Check if a **username** is taken across different platforms like GitHub or GitLab.
- Look up the background details of a **web domain** or **email address** to see how they are configured and if they look legitimate.

The OSINT Footprint Checker is an edge-native open-source intelligence tool that investigates digital footprints across four distinct modes: IP addresses, web domains, usernames, and email addresses.

---

## Modes

### IP Intelligence

Investigates a given IPv4 or IPv6 address using parallel lookups:

| Data Point | Source |
|---|---|
| Geolocation (city, region, country) | Serverless Edge Metadata (for self) / ipwho.is |
| ASN / Organisation | Serverless Edge Metadata (for self) / ipwho.is |
| Timezone & coordinates | Serverless Edge Metadata (for self) / ipwho.is |
| Reverse DNS (PTR record) | Cloudflare DNS (1.1.1.1) via Secure DoH |
| IP classification (public / private / CGNAT) | Local logic |

**Usage:** Enter an IP address (e.g. `8.8.8.8`, `2001:4860:4860::8888`) or click **Check My IP** to inspect your own connecting address via native edge metadata.

---

### Domain Footprint

Runs a comprehensive reconnaissance pass on a domain, covering registration, DNS, email security, and certificate transparency:

| Data Point | Source |
|---|---|
| Registrar, registration & expiry dates | RDAP Protocol (bootstrapped via rdap.org) |
| Domain status, registrant info | RDAP Protocol (bootstrapped via rdap.org) |
| A, AAAA, MX, NS, CNAME, TXT, SOA records | Cloudflare DNS (1.1.1.1) via Secure DoH |
| SPF / DMARC records | Cloudflare DNS (1.1.1.1) via Secure DoH |
| Historical SSL certificates | crt.sh (Certificate Transparency) |
| Unique subdomains from CT logs | crt.sh (Certificate Transparency) |

The subdomain enumeration works by querying the [crt.sh](https://crt.sh) database for all SSL certificates ever issued for `*.domain`. Because certificate issuance is logged publicly to Certificate Transparency logs, this reveals subdomains that may not appear in public DNS.

> [!TIP]
> Certificate transparency subdomain enumeration is highly effective against domains that use Let's Encrypt or other public CAs. Domains using private CAs or wildcard certs may appear to have fewer subdomains.

---

### Username Lookup

Queries the public APIs of several platforms in parallel to check for account existence:

| Platform | Method | Rate Limit |
|---|---|---|
| **GitHub** | `GET /users/{username}` | 60 req/hr (unauthenticated) |
| **GitLab** | `GET /api/v4/users?username={username}` | Standard |
| **Hacker News** | Firebase REST API | None |
| **Docker Hub** | `GET /v2/users/{username}/` | Standard |
| **npm** | CouchDB user registry | Standard |

When a profile is found, available public metadata (name, bio, location, join date, follower count, etc.) is displayed.

Platforms that time out during the request window are listed separately as **Timed out** in the Platform Summary rather than counted as "Not found."

> [!NOTE]
> npm's CouchDB user registry may include the account's email address in its public API response if the owner chose to make it public on npm. This tool surfaces it only when present in that public response — it is data the subject published themselves.

---

### Email Analysis

Performs a comprehensive email security audit without ever contacting the address itself. All checks are DNS-only — 8 parallel queries run per request.

#### Infrastructure Checks

| Check | Method |
|---|---|
| Mail server existence | MX record lookup via Cloudflare DNS |
| Mail provider identification | MX host pattern matching (13 providers) |
| Domain web presence | A record lookup via Cloudflare DNS |
| Disposable domain detection | Local blocklist (~50 known disposable providers) |
| Free provider detection | Local allowlist (13 common providers) |

#### SPF (Sender Policy Framework)

| Check | Details |
|---|---|
| Record presence | TXT record lookup at the domain |
| Policy strength | Detects `+all` (permissive), `~all` (softfail), `-all` (hardfail), `?all` (neutral) |
| DNS lookup count | Counts mechanisms that consume a lookup (`include:`, `a`, `mx`, `ptr`, `exists:`). RFC 7208 allows a maximum of 10 — warns at 8+. |

#### DMARC (Domain-based Message Authentication)

All DMARC tags are parsed and surfaced individually:

| Tag | Meaning |
|---|---|
| `p=` | Policy applied to the domain: `none` (monitor), `quarantine`, or `reject` |
| `sp=` | Subdomain policy (inherits `p=` if absent) |
| `pct=` | Percentage of messages the policy applies to (default 100%) |
| `aspf=` | SPF identifier alignment: `r` (relaxed) or `s` (strict) |
| `adkim=` | DKIM identifier alignment: `r` (relaxed) or `s` (strict) |
| `rua=` | URIs for aggregate (summary) failure reports |
| `ruf=` | URIs for per-message forensic reports |
| `fo=` | Failure reporting options |

**Spoofing verdict:** A domain is considered spoofable if DMARC is missing or set to `p=none`, or if SPF uses `+all`. Having a strong DMARC policy (`quarantine` or `reject`) with 100% coverage is the gold standard.

#### DKIM (DomainKeys Identified Mail)

12 common selector names are probed simultaneously via DNS TXT queries at `<selector>._domainkey.<domain>`:

`default`, `google`, `k1`, `selector1`, `selector2`, `mail`, `dkim`, `mandrill`, `mailjet`, `pm`, `sendgrid`, `sparkpost`

For each selector found, the RSA key length is extracted from the `p=` base64 value and flagged if below 2048 bits.

> [!NOTE]
> DKIM selector probing finds only commonly named selectors. Domains using non-standard selector names will appear to have no DKIM configured even if they do. Absence of results does not definitively confirm absence of DKIM.

#### Advanced Email Standards

| Standard | DNS Record Checked | What It Does |
|---|---|---|
| **MTA-STS** | `_mta-sts.<domain>` TXT | Enforces TLS for inbound email delivery — prevents downgrade attacks |
| **TLS-RPT** | `_smtp._tls.<domain>` TXT | Enables reporting of TLS connection failures to mail servers |
| **BIMI** | `default._bimi.<domain>` TXT | Brand Indicators for Message Identification — publishes a verified logo for display in supporting email clients |

> [!NOTE]
> MTA-STS policy presence is confirmed via DNS only. The policy file at `https://mta-sts.<domain>/.well-known/mta-sts.txt` is not fetched, as doing so from a server-side function would introduce a Server-Side Request Forgery (SSRF) risk.

---

## Architecture

The checker is implemented as a **serverless edge function** at `/functions/api/osint.js`. All four modes fan out their sub-checks in parallel using `Promise.allSettled()`, so a single slow or failing external API never blocks the rest of the response.

The email mode runs 8 DNS queries in parallel per request: MX, A, TXT (SPF), DMARC, MTA-STS, TLS-RPT, BIMI, and 12 concurrent DKIM selector probes via `Promise.allSettled()`.

When a sub-check times out specifically (as opposed to a generic network error), the UI surfaces a distinct ⚠ warning rather than a generic "unavailable" message. Affected lookups: geolocation (IP mode), RDAP registration data and crt.sh subdomain enumeration (domain mode), and individual platform checks (username mode).

---

## Ethical Use

This tool queries only **public** data sources and APIs that are designed to be queried. It does not access private data, authenticated endpoints, or conduct active probing. Use responsibly.
