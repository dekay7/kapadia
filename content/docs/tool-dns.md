---
title: DNS Analyzer
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 7
tool_desc: Query DNS records over HTTPS — A, AAAA, MX, TXT, CNAME.
tool_suffix: Self-hosted.
---

# DNS Analyzer

> [!NOTE]
> DNS queries are resolved server-side. No queries or results are logged or stored by kapadia.org.

The DNS Analyzer resolves standard DNS record types for any domain using a secure DNS-over-HTTPS (DoH) resolver. Queries are made by a Cloudflare edge function, not your browser.

---

## What Is DNS?

The **Domain Name System (DNS)** is essentially the phonebook of the internet. While humans use names like `google.com` or `kapadia.org`, computers use numbers called IP addresses (like `192.0.2.1`). 

DNS translates those human-friendly names into computer-friendly numbers so your browser can find the right website.

## What Is This Tool For?

This tool allows you to look up the "records" in that phonebook. You can see which server handles a website's emails, what its IP address is, and other behind-the-scenes settings that make a domain work.

---

## Supported Record Types

| Type | Description |
|---|---|
| **A** | IPv4 address(es) for the domain |
| **AAAA** | IPv6 address(es) for the domain |
| **MX** | Mail exchange records (mail servers + priority) |
| **TXT** | Text records (SPF, DKIM, verification tokens, etc.) |
| **CNAME** | Canonical name — alias pointing to another hostname |
| **NS** | Authoritative name servers for the domain |
| **SOA** | Start of Authority — zone metadata (serial, refresh, TTL) |

---

## Privacy & Data Sources

| Component | Service | Your IP Exposed? |
|---|---|---|
| DNS resolution | Cloudflare DNS-over-HTTPS (`cloudflare-dns.com`) | **No — edge IP only** |
| Query handling | kapadia.org Cloudflare edge function | **Yes (edge server)** |

All DNS queries are proxied through the edge — Cloudflare DoH sees the edge server's IP, not your personal IP.

---

## Technical Notes

- Queries use **DNS-over-HTTPS** (RFC 8484) with the `application/dns-json` content type, providing encryption in transit.
- All record types are fetched in parallel using `Promise.allSettled()`, so a missing record type does not block others.
- Results include the raw TTL values returned by the resolver.
