# kapadia.org

Personal research hub and digital laboratory focused on network diagnostics, security exploration, and minimalist software design. Built on an edge-native stack with no frameworks and no build complexity.

## Features

- **Interactive terminal** — animated `cd ~/` prompt that displays visitor IP, location, ASN, and navigation links; accepts `cd <path>` commands with Tab-completion cycling and ghost-text preview; swipe-right on mobile triggers Tab-completion
- **`curl kapadia.org`** — returns only your IP (plain text); works over HTTP and HTTPS
- **`/api/info`** — JSON endpoint with IP, city, region, country, timezone, ASN, and edge colo
- **Speed Test** — edge-native network throughput and latency diagnostics
- **Link Inspector** — traces redirect chains, scores URL safety (0–100 A–F), and surfaces domain intelligence; all fetching happens on the edge (SSRF-protected)
- **Email Header Analyzer** — paste raw email headers to score authentication (SPF/DKIM/DMARC), detect spoofing signals, and trace the relay chain; 100% client-side
- **OSINT Footprint** — investigates IPs, domains, usernames, and emails; email mode includes DKIM, DMARC, MTA-STS, TLS-RPT, and BIMI analysis
- **EXIF Inspector** — extract and strip hidden metadata (GPS, device, timestamps) from photos; 100% in-browser, nothing uploaded
- **Browser Fingerprint** — reveals HTTP headers, TLS ciphers, and browser fingerprinting data your connection leaks
- **Hash Generator** — SHA-1/256/512 and MD5 hashing via Web Crypto API and SparkMD5
- **DNS Analyzer** — record lookups (A, AAAA, MX, TXT, CNAME) via a secure DNS-over-HTTPS resolver
- **JWT Decoder** — decode and inspect JSON Web Tokens; 100% offline
- **Payload Encoder** — Base64, URL, Hex, and HTML encoding/decoding; no server involved
- **Subnet Calculator** — CIDR subnet math; fully client-side
- **Docs** — Markdown-authored documentation, server-side rendered at build time
- **Writes** — technical essays rendered from Markdown
- **CV** — HTML Curriculum Vitae with PDF download, served at `/about/cv/`
- **Auto dark/light** — `prefers-color-scheme`, zero JS required for theming
- **No tracking, no analytics, no cookies**

---

## Project Structure

```
kapadia-site/
├── content/
│   ├── docs/                 ← documentation pages (Markdown)
│   │   ├── index.md
│   │   ├── getting-started.md
│   │   ├── architecture.md
│   │   ├── api-reference.md
│   │   ├── curl-ip.md
│   │   ├── curl-ip-selfhost.md
│   │   ├── tool-speed.md
│   │   ├── tool-link.md
│   │   ├── tool-email.md
│   │   ├── tool-exif.md
│   │   ├── tool-osint.md
│   │   ├── tool-dns.md
│   │   ├── tool-hash.md
│   │   ├── tool-jwt.md
│   │   ├── tool-encode.md
│   │   ├── tool-subnet.md
│   │   └── tool-leak.md
│   └── writes/               ← essays and writeups (Markdown)
├── functions/
│   ├── _middleware.js        ← curl detection on HTTPS (returns IP for curl/wget)
│   ├── lib/
│   │   └── ip.js             ← shared IP parsing helper (ipVersion, getConnectingIP)
│   └── api/
│       ├── info.js           ← GET /api/info — visitor data JSON
│       ├── link.js           ← GET /api/link — redirect tracing, safety scoring
│       ├── osint.js          ← GET /api/osint — OSINT footprint checker
│       ├── dns.js            ← GET /api/dns — DNS-over-HTTPS resolver
│       └── leak.js           ← GET /api/leak — TLS/header fingerprinting data
├── scripts/
│   ├── check-sync.js         ← build-time check: ensures shared functions are identical
│   │                            across _middleware.js and http-handler.js
│   └── render.js             ← build script: renders Markdown → *-content.js files
├── http-handler.js           ← standalone Worker (curl detection on plain HTTP)
├── package.json              ← devDependencies: marked; wrangler
├── wrangler.toml             ← Pages project config
├── wrangler-http.toml        ← kapadia-http Worker config
└── public/
    ├── index.html            ← homepage + interactive terminal
    ├── 404.html
    ├── robots.txt
    ├── _headers              ← Cloudflare response headers (CSP, etc.)
    ├── about/
    │   ├── index.html        ← about page
    │   └── cv/
    │       └── index.html    ← HTML Curriculum Vitae with PDF download
    ├── curl-ip/              ← self-hosting reference served at /curl-ip/
    │   ├── http-handler.js
    │   ├── middleware.js
    │   └── wrangler-http.toml
    ├── tools/                ← web-based diagnostic tools
    │   ├── index.html        ← tools directory page
    │   ├── speed/
    │   ├── link/
    │   ├── email/
    │   ├── exif/
    │   ├── leak/
    │   ├── hash/
    │   ├── osint/
    │   ├── dns/
    │   ├── jwt/
    │   ├── encode/
    │   └── subnet/
    ├── docs/
    │   └── index.html        ← docs hub (sidebar + server-rendered Markdown)
    ├── writes/
    │   └── index.html        ← essays list + reader
    ├── privacy/
    │   └── index.html
    ├── css/                  ← per-page stylesheets
    │   ├── shared.css
    │   ├── index.css
    │   ├── tools.css
    │   ├── docs.css
    │   ├── cv.css
    │   ├── writes.css
    │   └── ...
    ├── js/                   ← per-page and per-tool scripts
    │   ├── index.js          ← homepage terminal animation + input handling
    │   ├── docs.js
    │   ├── docs-content.js   ← compiled doc content (generated by render.js)
    │   ├── cv.js
    │   ├── writes.js
    │   ├── writes-content.js ← compiled writes content (generated by render.js)
    │   ├── speed.js
    │   ├── tools/            ← per-tool JS files
    │   │   ├── dns.js
    │   │   ├── encode.js
    │   │   ├── exif.js
    │   │   ├── hash.js
    │   │   ├── jwt.js
    │   │   ├── leak.js
    │   │   ├── link.js
    │   │   ├── osint.js
    │   │   └── subnet.js
    │   └── vendor/
    │       └── exifr.min.js  ← vendored EXIF library (SRI-pinned, no CDN)
    └── assets/
        ├── favicon.svg
        └── cv.pdf
```

---

## Deployment

### Automatic (GitHub → Edge Deployment)

Every push to `master` triggers an automatic build and deploy via the Cloudflare Pages GitHub integration. Cloudflare runs `npm run render` as the build command, which first runs `scripts/check-sync.js` (a build-time guard that fails the build if shared helper functions have drifted out of sync between `_middleware.js` and `http-handler.js`) and then `scripts/render.js` (which compiles Markdown content into `*-content.js` files).

```bash
git add content/ public/js/
git push origin master        # Cloudflare builds and deploys automatically
```

The Pages project is configured by **`wrangler.toml`** at the repo root, which tells the platform which directory to serve (`./public`) and the compatibility date.

### First-Time Project Setup

If you ever need to recreate the Pages project from scratch:

1. Go to your deployment dashboard → **Create a project**
2. Connect your GitHub account and select this repository
3. Set **Build output directory** to `public` (no build command needed)
4. Add custom domain `kapadia.org` under **Custom Domains**

### HTTP Worker (kapadia-http)

The `http-handler.js` Worker intercepts plain-HTTP requests to serve the curl IP response before Cloudflare's own HTTP→HTTPS redirect fires. This Worker's GitHub repository is also connected to the platform — every push to `master` triggers an automatic redeploy.

---

## Local Development

```bash
npm run dev          # renders Markdown content, then starts on port 8788
```

Or manually:

```bash
npm run render
wrangler pages dev public --port 8788
```

Visit `http://localhost:8788`. The terminal will show fallback data since `CF-Connecting-IP` and `request.cf` are not populated locally.

---

## Adding Documentation

1. Create a Markdown file in `content/docs/`, e.g. `content/docs/my-guide.md`.
2. Add YAML frontmatter at the top of the file:

```markdown
---
title: My Guide
breadcrumb: docs / guides
sidebar_section: Site Guides
sidebar_order: 1
---

# My Guide
...
```

That's it. The sidebar entry and page title are derived from frontmatter automatically — no changes to `docs.js` or `docs/index.html` are needed.

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `title` | Yes | Page title (used in `<title>` tag and sidebar) |
| `breadcrumb` | Yes | Breadcrumb text shown at the top of the doc |
| `sidebar_section` | Yes | Sidebar group: `Overview`, `Site Guides`, `Technology Tools`, `Technical Reference` (or any new name) |
| `sidebar_order` | Yes | Integer — sort order within the section |
| `sidebar_label` | No | Override the sidebar button text if it should differ from `title` |

---

## Adding Write-ups

1. Create a Markdown file in `content/writes/`, e.g. `content/writes/my-post.md`.
2. Add YAML frontmatter at the top of the file:

```markdown
---
title: My Post
excerpt: A brief summary of what this post covers.
date: 2026-05
readTime: 4 min
tags: tag1, tag2
---

## First Section
...
```

That's it. The write-up appears in the list automatically sorted by `date` — no changes to `writes.js` are needed.

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `title` | Yes | Post title |
| `excerpt` | Yes | Short description shown in the list view |
| `date` | Yes | `YYYY-MM` format — used for sorting (newest first) |
| `readTime` | Yes | Estimated read time, e.g. `4 min` |
| `tags` | Yes | Comma-separated tag list |

---

## Updating the CV

The HTML Curriculum Vitae lives at `public/about/cv/index.html`. To update the PDF download, replace `public/assets/cv.pdf`.

---

## Customizing the Terminal

The terminal is built in `public/js/index.js` inside `runTerminal()`. The `specs` array defines the animation sequence — each entry has a `t` (text), `cls` (CSS class), and `d` (delay in ms from the previous line, via `tick()`).

To change the navigation links shown after the IP/location block, edit the `nav` entries:

```javascript
{ t: '  → /tools/    security & network tools', cls: 'nav', d: tick(50) },
```

To add supported `cd` destinations (so they tab-complete and navigate), extend the `COMMANDS` map at the top of the file:

```javascript
const COMMANDS = Object.freeze({
  'tools': '/tools/',
  // add your path here
  'mypage': '/mypage/',
  ...
});
```

---

## Environment

- Edge Hosting + Serverless Functions (Cloudflare Pages + Workers)
- GitHub integration for automatic CI/CD deploys on push to `master`
- Markdown rendered at build time via `scripts/render.js` (uses `marked`)
- No npm build step for static assets — pure HTML/CSS/JS
- No tracking, no analytics, no cookies
- Fonts served from Google Fonts CDN
- Third-party vendor scripts served from `/public/js/vendor/` (CSP `'self'` compliant, SRI-pinned)
