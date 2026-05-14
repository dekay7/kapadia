---
title: JWT Decoder
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 7
---

# JWT Decoder

> [!NOTE]
> This tool is 100% client-side. Token contents never leave your browser.

The JWT Decoder splits and base64-decodes a JSON Web Token into its three components: header, payload, and signature.

---

## What is a JWT?

A **JSON Web Token (JWT)** is a compact way to securely send information between two parties. Think of it like a digital ID card or a ticket. 

For example, when you log into a website, the server might give you a JWT. Your browser then shows this "ID card" every time you want to see your profile or make a purchase, so the website knows who you are without you having to log in again for every single click.

## What is this tool for?

While JWTs look like a random jumble of letters and numbers, they actually contain readable information. This tool "unpacks" that jumble so you can see what data is stored inside, such as your username or when the "ticket" expires.

---

## JWT Structure

A JWT is three base64url-encoded segments separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← Header
.eyJzdWIiOiIxMjM0NTY3ODkwIn0             ← Payload
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ← Signature
```

| Part | Contents |
|---|---|
| **Header** | Algorithm (`alg`) and token type (`typ`) |
| **Payload** | Claims — `sub`, `iat`, `exp`, and any custom fields |
| **Signature** | HMAC or RSA/ECDSA signature over header + payload |

> [!IMPORTANT]
> This tool **decodes** only — it does not verify the signature. A decoded token does not mean a trusted token. Always validate signatures server-side using your signing key.

---

## Privacy & Data Sources

No third-party services are used. Decoding is pure JavaScript string manipulation (`atob()`) running entirely in your browser tab. Nothing is sent over the network.
