---
title: Hash Generator
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 5
tool_desc: Hash text with MD5, SHA-1, SHA-256, or SHA-512.
tool_suffix: No data sent.
---

# Hash Generator

> [!NOTE]
> This tool is 100% client-side. No data leaves your browser — no text, no files, no hashes.

The Hash Generator computes cryptographic hashes for text input or file contents entirely in your browser.

---

## What is a Hash?

A **hash** is like a "digital fingerprint" of a piece of information. When you "hash" text or a file, you get a unique, fixed-length string of characters. 

Crucially:
1. If you change even one tiny comma in your text, the hash will look completely different.
2. You cannot turn a hash back into the original text or file. It's a one-way street.

## What is this tool for?

This tool is used to verify that information hasn't been changed. For example, if you download a file and the creator says its hash should be `abc123...`, you can use this tool to check your file's hash. If they match, you know the file is exactly what the creator intended and hasn't been tampered with or corrupted.

---

## Supported Algorithms

| Algorithm | Implementation | Notes |
|---|---|---|
| **MD5** | SparkMD5 library | Legacy — not collision-resistant; use for checksums only |
| **SHA-1** | Web Crypto API | Deprecated for security use; still common for git object IDs |
| **SHA-256** | Web Crypto API | General-purpose secure hashing |
| **SHA-512** | Web Crypto API | Larger output; useful when extra margin is desired |

---

## Hash Comparison

Paste an expected hash into the "Compare Hash" field to check for equality. The tool performs a case-insensitive string comparison — no timing-safe comparison is required here since both values are already known to the browser.

---

## Privacy & Data Sources

| Component | Service | Your IP Exposed? |
|---|---|---|
| SHA algorithms | Browser Web Crypto API | **No — fully local** |
| MD5 algorithm | SparkMD5 v3.0.2 (loaded from `cdnjs.cloudflare.com` with SRI) | **Yes — CDN load only** |

SparkMD5 is loaded once from `cdnjs.cloudflare.com` when the page loads, exposing your IP to that CDN (Cloudflare). The library is verified with a Subresource Integrity (SRI) hash — no code can be injected. After loading, **no data is ever sent anywhere**; all hashing is local.

> [!TIP]
> If you need to avoid any CDN exposure, you can hash SHA-256 or SHA-512 values via `curl` or any local tool — those algorithms produce identical output.
