---
title: curl kapadia.org
breadcrumb: docs / reference
sidebar_section: Technical Reference
sidebar_order: 2
---

# curl kapadia.org

Get your public IP address directly from your terminal.

## How to Use It

```bash
curl kapadia.org
```

## Forcing IPv4 or IPv6

```bash
# Force IPv4
curl -4 kapadia.org

# Force IPv6
curl -6 kapadia.org
```

## How It Works

When you send a request, a serverless edge function checks your **User-Agent**. If it indicates a CLI tool like `curl`, the function returns the IP address as plain text.
