---
title: Building Edge-Native Applications
excerpt: Why I moved away from traditional VPS hosting and what I learned building on a global edge network.
date: 2025-01
readTime: 6 min
tags: serverless, infrastructure
---

## Introduction

After years of running servers, I made the switch to a fully edge-native stack. No VPS, no container registries, no persistent databases — just serverless functions, edge hosting, and distributed storage.

This is what I learned.

## Why the Edge?

The promise of edge computing is latency: your code runs in a data center geographically close to the request. For read-heavy, stateless workloads, this is compelling.

> The cold start problem that plagues serverless functions nearly disappears on modern edge networks, which have hundreds of points of presence (PoPs) worldwide.

## The Stack

- **Edge Hosting** for static assets and CI/CD
- **Serverless Functions** for edge logic
- **KV Store** for lightweight key-value storage
- **Distributed SQL** when relational queries are needed
- **Object Storage** for larger assets

## What I Gave Up

Nothing is free. Here's what I traded:

- Long-running processes (edge functions often have strict CPU limits)
- Easy server-side debugging
- Arbitrary package installs at runtime

## Verdict

For personal projects and content sites, an edge-native stack is nearly perfect. Fast, cheap, and low-maintenance.

---

*See the [architecture docs](/docs/) for how this site is structured.*
