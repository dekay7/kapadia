---
title: Getting Started
breadcrumb: docs / site guides
sidebar_section: Site Guides
---

# Getting Started

If you're new to kapadia.org, this guide will help you understand how to navigate the site and use our tools effectively.

## Navigation

- **Tools**: Access our suite of security and network utilities.
- **Docs**: Read technical documentation and guides (you are here).
- **Writes**: Technical essays and project deep-dives.
- **About**: Background information on the project and the author.

## Using the Technology Tools

Most tools on this site are designed to be "plug and play." For example:
- **Speed Test**: Measures your network throughput (how fast you can download/upload data) and latency (the delay in your connection).
- **Link Inspector**: Paste any URL — including shortened links — to trace exactly where it goes, grade its safety (A–F), and inspect domain registration data. All fetching happens on the edge; your browser never contacts the target.
- **EXIF Inspector**: Drag and drop a photo to see every hidden metadata field (GPS coordinates, device model, timestamps) and download a stripped copy. Everything runs in your browser — nothing is ever uploaded.
- **Browser Fingerprint**: See exactly what HTTP headers, TLS ciphers, and browser API values your connection is leaking to servers you visit.
- **Hash Generator**: Compute MD5, SHA-1, SHA-256, and SHA-512 hashes entirely in your browser using the Web Crypto API.
- **OSINT Footprint**: Investigates IPs, domains, usernames, and email addresses using public data sources. The email mode includes full DKIM, DMARC, MTA-STS, TLS-RPT, and BIMI analysis.
- **DNS Analyzer**: Helps you look up DNS records (A, AAAA, MX, TXT, CNAME) for any domain using a secure DNS-over-HTTPS resolver.
- **JWT Decoder**: Paste a JSON Web Token to decode and inspect its header and payload — 100% offline, no data leaves your browser.
- **Payload Encoder**: Encode or decode Base64, URL, Hex, and HTML strings instantly with no server involved.
- **Subnet Calculator**: Calculate network boundaries, broadcast addresses, and usable host ranges from any IP/CIDR notation.

## Command Line Access

For more advanced users, many features of this site can be accessed directly from your computer's terminal using tools like `curl`.

```bash
# Get your public IP address instantly
curl kapadia.org

# Get detailed visitor information as JSON
curl kapadia.org/api/info
```

## Terminology for Beginners

- **IP Address**: A unique string of numbers that identifies each computer on the internet.
- **DNS (Domain Name System)**: Translates human-readable domain names (like google.com) into IP addresses.
- **Edge Computing**: Processing data as close to the user as possible, resulting in faster load times.
