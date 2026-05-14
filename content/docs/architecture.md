---
title: Architecture
breadcrumb: docs / reference
sidebar_section: Technical Reference
sidebar_order: 1
---

# Architecture

kapadia.org is designed with a "Privacy First, Edge First" philosophy. It uses a modern stack that eliminates the need for heavy servers or invasive tracking.

## System Overview

```
User Request (Browser or CLI)
      │
      ▼
Global Edge Network
      │
      ├── Pages Functions (_middleware.js)  ← Detects 'curl' requests
      │
      ├── API Workers (/api/...)           ← Processes dynamic data
      │     ├── /api/info    — Visitor metadata (IP, geo, colo)
      │     ├── /api/leak    — TLS/header fingerprinting
      │     ├── /api/dns     — DNS-over-HTTPS resolver
      │     ├── /api/link    — Link Inspector (redirect tracing,
      │     │                   domain intel, safety scoring)
      │     └── /api/osint   — OSINT footprint checker
      │                         (IP, domain, username, email — with DKIM,
      │                          DMARC, MTA-STS, TLS-RPT, BIMI)
      │
      ├── Client-Side Only Tools          ← No server component
      │     ├── /tools/exif  — EXIF metadata inspector + stripper
      │     │                   (FileReader + exifr + Canvas API)
      │     ├── /tools/hash  — Cryptographic hashing (Web Crypto API)
      │     ├── /tools/jwt   — JWT decoder
      │     ├── /tools/encode — Encoding utilities
      │     └── /tools/subnet — Subnet calculator
      │
      └── Static Assets                    ← Optimized HTML/CSS/JS
```

## Core Technologies

### Edge Computing & Serverless
Every request is handled by a globally distributed network of edge nodes. API functions use `Promise.allSettled()` to fan out parallel sub-requests, so a slow external API never blocks the response.

### Vanilla JavaScript
We avoid heavy frameworks to keep the site small, fast, and secure.

---

## Third-Party Services — Per Tool

The table below lists every external service each tool contacts, and whether your personal IP is exposed.

### Client-Side Tools (No Third-Party Data Services)

These tools run entirely in your browser. No input data reaches any server.

| Tool | How it works | External Services |
|---|---|---|
| **JWT Decoder** | Pure JS (`atob`) | None |
| **Payload Encoder** | Built-in JS APIs | None |
| **Subnet Calculator** | Bitwise JS arithmetic | None |
| **EXIF Inspector** | FileReader + vendored `exifr` | None (GPS links open OpenStreetMap in new tab — only if you click) |
| **Hash Generator** | Web Crypto API (SHA) + SparkMD5 (MD5) | `cdnjs.cloudflare.com` — library load only, no data sent |

### Server-Side Tools (Edge Functions as Privacy Shield)

These tools send your query to a Cloudflare edge function. The edge function contacts third-party services; those services see the **edge IP**, not your personal IP.

| Tool | Third-Party Service | Purpose |
|---|---|---|
| **DNS Analyzer** | Cloudflare DoH (`cloudflare-dns.com`) | DNS resolution |
| **Browser Fingerprint** | None beyond the edge | Header / TLS capture — no sub-requests |
| **Speed Test** | `speed.cloudflare.com` (direct browser connection) | Throughput test — **user IP exposed to Cloudflare** |
| **Link Inspector** | Cloudflare DoH, RDAP (`rdap.org`), target URL | DNS pre-resolution, domain registration, redirect tracing |
| **OSINT — IP mode** | ipwho.is, Cloudflare DoH | Geolocation, reverse DNS |
| **OSINT — Domain mode** | RDAP (`rdap.org`), Cloudflare DoH, crt.sh | Registration, DNS, certificate transparency |
| **OSINT — Username mode** | GitHub API, GitLab API, Hacker News, Docker Hub, npm | Public profile lookups |
| **OSINT — Email mode** | Cloudflare DoH | DNS-based email security analysis |

### Site-Wide Infrastructure

| Service | Purpose | Your IP Exposed? |
|---|---|---|
| **Google Fonts** | Typography (Cormorant Garamond, DM Sans, JetBrains Mono) | **Yes — on every page load** |
| **cdnjs (Cloudflare)** | Vendor libraries (SparkMD5) | **Yes — on relevant page loads** |

> [!NOTE]
> **Privacy by Proxy:** For all investigative tools (OSINT, DNS, Link Inspector), kapadia.org's edge acts as a proxy. Third-party data services only see the edge server's IP — never yours.

> [!NOTE]
> **Speed Test is direct:** Unlike the other edge tools, speed test traffic goes from your browser directly to `speed.cloudflare.com`. Cloudflare will see your personal IP for that traffic.

> [!NOTE]
> **EXIF Inspector is fully local:** Files are read by your browser's FileReader API. No bytes of your image are transmitted anywhere. The `exifr` library (v7.1.3) is self-hosted at `/js/vendor/exifr.min.js` with a Subresource Integrity (SRI) hash — no CDN phone-home.
