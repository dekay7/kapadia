---
title: Payload Encoder
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 8
---

# Payload Encoder

> [!NOTE]
> This tool is 100% client-side. No data is sent to any server or third-party service.

The Payload Encoder converts strings between common encoding formats used in web development and security work.

---

## What is Encoding?

**Encoding** is a way of transforming information from one format into another. It isn't meant to keep secrets like a "code" or "ciphers"—instead, it's used to make sure data can be safely understood by different systems.

For example, a URL (a web address) can't contain spaces. If you want to include a space, it has to be "encoded" into `%20`.

## What is this tool for?

This tool helps you translate text between these different formats. Whether you need to make a piece of text safe for a URL, or decode a string of text that looks like a jumble of letters (Base64), this tool does the conversion for you instantly.

---

## Supported Operations

| Operation | Description |
|---|---|
| **Base64 Encode** | RFC 4648 standard base64 — common in JWTs, data URIs, HTTP Basic Auth |
| **Base64 Decode** | Reverses base64 encoding |
| **URL Encode** | Percent-encodes special characters (`encodeURIComponent`) |
| **URL Decode** | Reverses percent-encoding (`decodeURIComponent`) |
| **Hex Encode** | Each byte expressed as two hexadecimal digits |
| **Hex Decode** | Converts hex pairs back to their string representation |
| **HTML Entity Encode** | Escapes `< > & " '` as HTML entities |
| **HTML Entity Decode** | Reverses HTML entity encoding |

---

## Privacy & Data Sources

No third-party services are used. All encoding and decoding is pure JavaScript running in your browser using built-in APIs (`btoa()`, `atob()`, `encodeURIComponent()`, `decodeURIComponent()`). Nothing is sent over the network.
