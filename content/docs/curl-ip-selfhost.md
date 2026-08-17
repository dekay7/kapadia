---
title: Self-Hosting: curl domain → IP
breadcrumb: docs / reference
sidebar_section: Technical Reference
sidebar_label: Self-Hosting Curl IP
---

# Self-Hosting: Make `curl yourdomain.com` Return Your IP

This guide will show you how to set up the same `curl domain → IP` feature that powers `curl kapadia.org`.

## What You Will End Up With
Running `curl yourdomain.com` in any terminal will print your public IP address and nothing else.

---

## Prerequisites

- A **domain name** (e.g., `yourdomain.com`).
- A free **Cloudflare account**.
- Your domain's nameservers pointed at Cloudflare.
- **Node.js** installed on your computer.

---

## Step 1 — Install Wrangler

Wrangler is the command-line tool used to deploy Cloudflare Workers.

```bash
npm install -g wrangler
wrangler login
```

---

## Step 2 — Configuration

Create a new folder and download the following assets:
- [`http-handler.js`](/curl-ip/http-handler.js)
- [`wrangler-http.toml`](/curl-ip/wrangler-http.toml)

Edit `wrangler-http.toml` and replace `yourdomain.com` with your actual domain.

---

## Step 3 — Cloudflare Setup

1. Log in to your Cloudflare dashboard.
2. Select your domain.
3. Go to **SSL/TLS** → **Edge Certificates**.
4. Disable **Always Use HTTPS**.

> [!NOTE]
> Don't worry—your Worker will still redirect normal browsers to HTTPS. This just allows our script to catch the plain HTTP `curl` requests first.

---

## Step 4 — Deploy

In your terminal, navigate to your project folder and run:

```bash
wrangler deploy --config wrangler-http.toml
```

That's it! Your domain will now respond with the visitor's IP address when accessed via `curl`.
