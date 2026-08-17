---
title: Client-Side Markdown Rendering at Scale
excerpt: A look at parsing Markdown in the browser using marked.js, with considerations for performance and security.
date: 2024-12
readTime: 4 min
tags: markdown, frontend, javascript
---

## The Case for Client-Side Parsing

Server-side Markdown rendering is the orthodox approach — pre-build your HTML, serve static files. But for small sites where content changes infrequently and developer ergonomics matter, parsing in the browser is surprisingly reasonable.

## marked.js

[marked.js](https://marked.js.org/) is the library I settled on. It's:

- **Fast**: benchmarks suggest ~30ms for a 10,000-word document
- **Small**: ~20kb minified and gzipped
- **Spec-compliant**: passes CommonMark and GFM tests

### Basic Usage

```javascript
import { marked } from 'marked';

const html = marked.parse('# Hello\n\nWorld.');
document.getElementById('content').innerHTML = html;
```

## Security

Client-side rendering is a **XSS vector** if you render untrusted content. marked.js no longer sanitizes HTML by default. Add DOMPurify if you're rendering user-provided Markdown:

```javascript
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(marked.parse(input));
```

For trusted, author-controlled content (like this site), raw marked output is fine.

## Performance

On first load, there's a small script parse cost. Subsequent renders are near-instant. For a documentation site with 10–50 pages this is imperceptible.

---

The real cost is complexity: you lose search engine rendering of your content unless you add prerendering. For a personal site, I decided that tradeoff was acceptable.
