---
title: Notes on Web Typography
excerpt: Observations on type choices, pairing, and why most developer sites look the same.
date: 2024-10
readTime: 5 min
tags: design, typography
---

## The Sameness Problem

Developer sites trend toward a small pool of safe choices: Inter, Geist, or a system stack. These are good fonts — legible, free, well-hinted. But when everyone uses them, everything looks alike.

## What Makes Typography Distinctive

The most memorable sites usually have two things in common:

1. A display typeface with genuine character — something historical, geometric, or expressive
2. Strong contrast between display and body type

### Serif + Mono Pairings

My current favorite pairing: a classical serif at display scale with a monospace for everything else. The juxtaposition creates texture.

> **Cormorant Garamond** at 300 weight for headings. **JetBrains Mono** at 400 for body and UI.

This site uses exactly that.

## Variable Fonts

Variable fonts are underused. A single font file can cover a full weight and width axis, enabling responsive type that changes with context — heavier on large screens, lighter on mobile — without extra HTTP requests.

```css
font-weight: clamp(300, 2vw + 240, 500);
```

## Scale

The modular scale (1.25× or 1.333×) gives a rational hierarchy without fighting over pixel values. Choose a base size, multiply, round, move on.

| Step | Size (base 0.9375rem, 1.25×) |
|------|--------------------------|
| h4   | 0.9375rem                |
| h3   | 1.125rem                 |
| h2   | 1.4375rem                |
| h1   | 1.8125rem                |

---

Typography is the easiest high-leverage improvement available to most developer sites. Spend an afternoon on it.
