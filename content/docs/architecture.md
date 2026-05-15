---
title: Architecture
breadcrumb: docs / reference
sidebar_section: Technical Reference
sidebar_order: 1
---

# Architecture

kapadia.org is a privacy-first, edge-native site with no frameworks, no build complexity, and no tracking. Every request is handled at the edge — no traditional server.

## Stack

| Layer | Technology |
|---|---|
| Hosting | Cloudflare Pages (static) + Pages Functions (Workers) |
| HTML / CSS / JS | Vanilla — no frameworks, no bundler, no transpiler |
| Markdown | Compiled at build time via `marked`; output committed as static JS |
| DNS | Cloudflare |

## Request flow

```
Browser / curl
      │
      ▼
Cloudflare Edge
      │
      ├── _middleware.js     — detects curl; returns plain-text IP
      │
      ├── /api/*             — Pages Functions (Workers)
      │     Stateless edge functions that fan out to third-party services
      │     so those services see the edge IP, not the visitor's IP.
      │
      └── public/            — static assets (HTML, CSS, JS, fonts)
```

## Privacy model

- **Client-side tools** (encoding, hashing, JWT, EXIF, subnet) — nothing leaves the browser.
- **Edge-proxied tools** (DNS, OSINT, Link Inspector, Supply Chain, Browser Fingerprint) — queries go from the edge to third-party APIs; the visitor IP is never forwarded.
- **Speed Test** — traffic goes directly from the browser to `speed.cloudflare.com`; Cloudflare sees the visitor IP.
- **Site-wide** — Google Fonts is loaded on every page, which exposes visitor IP to Google.

## Build pipeline

`npm run render` (run by Cloudflare Pages on every push to `master`) compiles all Markdown in `content/docs/` and `content/writes/` to static JS modules (`*-content.js`, `tools-meta.js`) that are committed to the repo and served as `'self'` assets. No runtime Markdown parsing.
