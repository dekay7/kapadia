---
title: Email Header Analyzer
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 2
---

# Email Header Analyzer

> [!TIP]
> Copy the raw headers from any email and paste them here to investigate authentication, trace the relay chain, and detect spoofing signals — all without sending any data to a server.

## What is an Email Header Analyzer?

Every email carries a set of **raw headers** that travel invisibly alongside the message. These headers record every server the email passed through, whether cryptographic signatures verified correctly, and whether the sender was authorized to send on behalf of the claimed domain.

Attackers exploit mismatches in these headers to impersonate trusted senders — a technique called **email spoofing**. This tool surfaces those mismatches and scores the authentication posture of any email you inspect.

## What It Does

The analyzer parses the raw headers block, checks three authentication protocols (SPF, DKIM, DMARC), traces the relay chain, and produces a **security score (0–100)** with a letter grade (A–F). Everything runs 100% in your browser — no data is transmitted.

---

## How to Get Raw Headers

| Email Client | Instructions |
|---|---|
| **Gmail** | Open email → ⋮ → **Show original** → **Copy to clipboard** |
| **Outlook (web)** | Open email → ⋮ → **View** → **View message source** → Ctrl+A, Ctrl+C |
| **Outlook (desktop)** | File → Properties → **Internet headers** box → Ctrl+A, Ctrl+C |
| **Apple Mail** | View → Message → **Raw Source** → ⌘A, ⌘C |
| **Thunderbird** | Ctrl+U to open message source → Ctrl+A, Ctrl+C |

---

## Scoring System

The score starts at **100** and deductions are applied for each issue detected:

### Authentication (up to −55)

| Signal | Deduction |
|---|---|
| DMARC check failed | −25 |
| DMARC result missing | −15 |
| DKIM signature failed | −20 |
| DKIM result missing | −10 |
| SPF check failed | −15 |
| SPF softfail | −8 |
| SPF result missing | −5 |

### Identity Consistency (up to −35)

Comparisons use the **organizational domain** (last two labels, e.g. `glassdoor.com` from `mail9.glassdoor.com`), matching DMARC relaxed alignment. Subdomains of the same organization are not flagged.

| Signal | Deduction |
|---|---|
| From org domain ≠ DKIM signing org domain | −15 |
| From org domain ≠ Return-Path org domain | −10 |
| Reply-To org domain differs from From | −5 |
| Message-ID org domain differs from From | −5 |

### Transport Security (up to −30)

| Signal | Deduction |
|---|---|
| No relay hop used TLS | −20 |
| Some relay hops lacked TLS | −10 |
| Relay delay > 24 hours | −10 |
| Relay delay > 2 hours | −5 |

### Grades

| Score | Grade | Verdict |
|---|---|---|
| 90–100 | A | Strong authentication |
| 75–89  | B | Authentication passed with minor concerns |
| 55–74  | C | Authentication issues detected |
| 35–54  | D | Multiple authentication failures |
| 0–34   | F | Severe failures — likely spoofed |

---

## Results Sections

### Authentication Results
Three rows — SPF, DKIM, DMARC — each showing the verdict (pass / fail / softfail / missing) and relevant detail such as the DKIM signing domain, selector, and algorithm, or the DMARC enforcement policy.

### Security Signals
Every deduction applied, tagged with a risk level (critical / high / medium / low) and the point penalty. Informational flags (no deduction) also appear here, such as a DMARC policy set to "none" (monitoring only).

### Email Summary
Key metadata: From, To, Reply-To, Return-Path, Date, Subject, and Message-ID. Useful for quickly spotting display-name spoofing (where a friendly name hides a suspicious email address).

### Received Chain
A table of every server hop the email passed through, in chronological order (originating server first). Each row shows:
- **From** — the sending server hostname and IP address
- **By** — the receiving server
- **Protocol** — whether TLS was used (ESMTPS = encrypted; ESMTP = plain)
- **Delay** — time between this hop and the previous one

The originating server's IP includes a **→ OSINT** link to investigate it with the OSINT Footprint tool.

### Identity Analysis
A side-by-side comparison of the From domain against the DKIM signing domain, Return-Path domain, Reply-To domain, and Message-ID domain. Mismatches are flagged at the organizational domain level — `mail9.glassdoor.com` is treated as the same organization as `glassdoor.com` and will not trigger a warning. Cross-organization mismatches (e.g. `glassdoor.com` vs `glassdoor.net`) are highlighted in amber and are the core signal of email spoofing.

---

## Understanding the Three Authentication Protocols

### SPF (Sender Policy Framework)
The sending domain publishes a DNS TXT record listing IP addresses authorized to send email on its behalf. The receiving server checks whether the sending IP appears on that list. A **pass** means the IP is authorized; **fail** means it is not; **softfail** means the domain discourages but does not reject the sending IP.

### DKIM (DomainKeys Identified Mail)
The sending mail server signs outbound messages with a private key. The receiving server retrieves the corresponding public key from DNS and verifies the signature. A **pass** means the message body and key headers were not tampered with in transit. A **fail** means the signature is broken — either the message was modified or the signing domain is wrong.

### DMARC (Domain-based Message Authentication, Reporting & Conformance)
DMARC ties SPF and DKIM together and adds policy enforcement. For a DMARC check to **pass**, either SPF or DKIM must pass **and** the domain used by the passing check must match the From header domain (called *alignment*). The DMARC policy (`p=`) tells receiving servers what to do with failures: `none` (monitor only), `quarantine` (move to spam), or `reject` (discard outright).

> [!IMPORTANT]
> A DMARC pass with `p=none` does **not** protect recipients — it only means the domain owner is monitoring failures, not rejecting spoofed mail. Look for `p=REJECT` or `p=QUARANTINE` for meaningful protection.

---

## Privacy

- All parsing and scoring runs **100% in your browser** — raw headers are never transmitted anywhere
- The optional **→ OSINT** link opens the OSINT Footprint tool in a new tab; it is user-triggered, not automatic
- No cookies, no localStorage, no analytics

---

## Common Phishing Patterns This Tool Detects

| Pattern | What to look for |
|---|---|
| **Display name spoofing** | Friendly From name hides a mismatched domain in Email Summary |
| **Domain spoofing** | SPF or DKIM fail, From ≠ DKIM domain in Identity Analysis |
| **Cousin domain** | From domain is a typosquat (e.g. `paypa1.com`) — visible in Identity Analysis |
| **Reply-To hijacking** | Reply-To domain mismatch flagged as a signal |
| **Forwarded phishing** | SPF may fail after forwarding; check DKIM separately |
| **Compromised relay** | Unexpected hop in Received chain with no TLS |
