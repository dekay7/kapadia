---
title: Job Alerts
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 12
tool_desc: Subscribe to email digests for Cybersecurity and IT job listings from SimplifyJobs.
tool_suffix: 2026 cycle.
---

# Job Alerts

> [!NOTE]
> Listings are sourced from the SimplifyJobs GitHub repositories and refreshed every day. Email addresses are stored in Cloudflare D1 and used only for digest delivery — no tracking, no third-party sharing.

Browse current Cybersecurity and IT job listings for the 2026 recruitment cycle and subscribe to email digests when new postings appear. Listings cover both **Summer 2026 Internships** and **New Grad 2026** full-time positions.

---

## Categories

| Category | What It Covers |
|---|---|
| **Cybersecurity** | Security engineering, SOC, penetration testing, GRC, AppSec, DevSecOps, threat intelligence, and related roles |
| **IT** | Sysadmin, network engineering, DevOps, SRE, cloud engineering, help desk, IT support, and infrastructure roles |

Jobs are filtered from the SimplifyJobs dataset by keyword matching on job titles. A listing may appear in both categories if the title matches both.

---

## Listing Types

- **Internship 2026** — Summer 2026 internship positions (sourced from [SimplifyJobs/Summer2026-Internships](https://github.com/SimplifyJobs/Summer2026-Internships))
- **New Grad 2026** — Full-time new graduate positions (sourced from [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions))

---

## Email Alerts

Subscribe to receive a digest email whenever new listings are found since the last check. Each subscription is per category and listing type — subscribe to as many combinations as you need.

### How It Works

1. Enter your email in the Cybersecurity or IT section and click **Subscribe**
2. A verification email is sent from `alerts@kapadia.org`
3. Click the link in the email to confirm your address
4. You will receive digest emails when new listings appear (up to twice daily)
5. Every digest email includes an **Unsubscribe** link at the bottom

### Privacy

- Email addresses are stored in a Cloudflare D1 database scoped to this site
- Digests are sent via [Resend](https://resend.com) from `alerts@kapadia.org`
- Unsubscribing immediately deletes your address from the database
- Job listing data (title, company, URL) is retained for up to 120 days from when a listing was first seen, then automatically deleted
- No analytics, tracking pixels, or open/click tracking

---

## Data Source

Listings are pulled from the SimplifyJobs GitHub repositories, which are community-maintained and updated continuously throughout the recruitment cycle. The data is refreshed at 14:00 UTC.

The current cycle targets **2026** listings. To update the cycle (e.g. for 2027), change the `CYCLE` constant at the top of `job-digest.js`.

---

## Closed Listings

Listings that are no longer accepting applications are shown with a **Closed** badge. They remain visible for reference — useful for tracking which companies recruited in a given cycle. Listings older than 120 days are automatically removed from the database regardless of status.
