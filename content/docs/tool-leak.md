---
title: Browser Fingerprint
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 5
tool_desc: See what headers, TLS ciphers, and signals your browser is leaking.
tool_suffix: Self-hosted.
---

# Browser Fingerprint

> [!NOTE]
> No fingerprint data is logged or stored by kapadia.org. The data is displayed to you and then discarded.

## What is Browser Fingerprinting?

A **browser fingerprint** is a collection of small details about your computer and browser that, when combined, can uniquely identify you. Even if you hide your IP address with a VPN, websites can often still "recognize" you by looking at your screen resolution, the fonts you have installed, your battery level, and more.

## What is this tool for?

This tool shows you exactly what information your browser is sharing with every website you visit. It's a "transparency report" for your own device, helping you understand how you might be tracked online even without using cookies.

The Browser Fingerprint tool shows you exactly what information your browser exposes to websites. Data is gathered from two sources: a server-side edge function that reads your request headers, and client-side JavaScript that queries browser APIs directly.

---

## Data Sections

### Network & TLS (Server-Side)

Captured by the Cloudflare edge function from your incoming HTTP request:

| Field | Source |
|---|---|
| IP address | Inferred from the connection |
| TLS version | Negotiated cipher suite |
| HTTP version | HTTP/1.1, HTTP/2, or HTTP/3 |
| Country / region / city | Cloudflare geo metadata |
| ASN / ISP | Cloudflare network metadata |
| Cloudflare colo | Edge data center handling your request |

### HTTP Headers (Server-Side)

Raw request headers as received by the edge server, including:
`User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, `DNT`, `Sec-Fetch-*`, `Referer`

### Client Environment (Client-Side JS)

Queried from browser APIs in your tab — no network request involved:

| Field | API Used |
|---|---|
| Screen resolution | `screen.width / height` |
| Colour depth | `screen.colorDepth` |
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| Language | `navigator.language` |
| CPU cores (logical) | `navigator.hardwareConcurrency` |
| Device memory | `navigator.deviceMemory` |
| Touch support | `navigator.maxTouchPoints` |
| Platform | `navigator.platform` |
| Cookie / storage | `navigator.cookieEnabled` |

---

## Privacy & Data Sources

| Component | Service | Your IP Exposed? |
|---|---|---|
| HTTP header capture | kapadia.org Cloudflare edge | **Yes (edge server)** |
| TLS / network metadata | Cloudflare edge infrastructure | **Yes (edge server)** |
| Browser API queries | Client-side JS — no network | **No** |

Your IP is seen by the Cloudflare edge in the normal course of serving the page. No third-party services receive your data. Nothing is retained after the page loads.
