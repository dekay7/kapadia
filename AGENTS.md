# kapadia.org — Development Manual

This document is the authoritative reference for anyone (human or AI agent) making changes to kapadia.org. Read it fully before touching any file. Every rule here exists for a specific reason; do not violate a rule because it seems minor or inconvenient.

---

## 1. Core Philosophy

kapadia.org is a **personal digital laboratory** — a privacy-first, edge-native site with zero frameworks, zero build complexity, and zero tracking. Every decision made on this project flows from four axioms:

1. **Lean over capable.** No feature, abstraction, or dependency that isn't required. Three explicit lines beat one "clever" helper. Never add a library when a browser API exists.
2. **Secure by default.** Security is not a checklist — it is the first design constraint, not the last review step. Every feature must be threat-modelled before implementation.
3. **Accessible to everyone.** Screen readers, keyboard-only users, mobile users, and users who have disabled JavaScript must get a meaningful experience wherever possible.
4. **Future-iteration friendly.** New tools, docs, and writes should slot in with minimal friction. Shared patterns must not diverge between pages.

If a proposed change cannot be justified against all four axioms simultaneously, rethink the approach before implementing it.

---

## 2. Technology Stack

| Layer | Technology | Constraint |
|---|---|---|
| HTML | Vanilla HTML5 | No template engines, no JSX |
| CSS | Vanilla CSS3 | No frameworks, no preprocessors |
| Client JS | Vanilla ES2020+ | No bundler, no transpiler |
| Server | Cloudflare Workers (Pages Functions) | ESM only, `export async function onRequest*` |
| Markdown | `marked` (dev only, build-time) | Only used by `scripts/render.js` — never at runtime |
| Version control | Git, `master` branch | Pushes to `master` trigger automatic deploy |

**There is no npm, no webpack, no Vite, no React, no TypeScript, no Tailwind, no PostCSS.** If you find yourself reaching for any of these, stop and reconsider the approach. The entire site works by serving static files from `./public/` with a few edge functions in `./functions/`.

---

## 3. Repository Layout

```
kapadia-site/
├── content/
│   ├── docs/          ← Markdown source for /docs/ pages
│   └── writes/        ← Markdown source for /writes/ essays
├── functions/
│   ├── _middleware.js ← Global Pages middleware (curl detection)
│   ├── lib/
│   │   └── ip.js      ← Shared IP parsing utilities
│   └── api/
│       ├── info.js    ← GET /api/info (visitor metadata)
│       └── <name>.js  ← GET /api/<name> — one file per edge-side tool
├── scripts/
│   ├── check-sync.js  ← Build guard: verifies _middleware.js / http-handler.js parity
│   └── render.js      ← Build script: Markdown → *-content.js
├── http-handler.js    ← Standalone Worker for plain-HTTP curl detection
├── wrangler.toml      ← Pages project config
├── wrangler-http.toml ← HTTP Worker config
└── public/
    ├── _headers       ← Cloudflare response headers (CSP lives here)
    ├── index.html     ← Homepage
    ├── 404.html
    ├── robots.txt
    ├── assets/        ← favicon.svg, cv.pdf
    ├── css/           ← Per-page stylesheets (shared.css is the base)
    ├── js/
    │   ├── *.js       ← Per-page scripts
    │   ├── tools/     ← Per-tool JS files
    │   └── vendor/    ← Vendored third-party scripts (SRI-pinned)
    └── tools/
        └── <name>/
            └── index.html  ← One HTML file per tool
```

---

## 4. Deployment & Build

### Build pipeline

The build command (run by Cloudflare Pages on every `master` push) is:

```bash
npm run render
# = node scripts/check-sync.js && node scripts/render.js
```

`check-sync.js` fails the build if shared helper functions in `_middleware.js` and `http-handler.js` have drifted. **Never bypass this check.**

`render.js` reads all Markdown files in `content/docs/` and `content/writes/`, converts them to HTML via `marked`, and writes the output into `public/js/docs-content.js` and `public/js/writes-content.js`. These generated files are committed to the repository and must be regenerated whenever Markdown content changes.

### Local development

```bash
npm run dev        # render + wrangler pages dev public --port 8788
```

`CF-Connecting-IP` and `request.cf` are not populated locally; the terminal and OSINT tools will show fallback values.

### Deployment

Push to `master`. That's it. Cloudflare Pages handles everything. Never force-push to `master`.

---

## 5. Security — Non-Negotiable Rules

Security is the most important section in this document. **Read it twice.**

### 5.1 DOM Output

- **Never use `innerHTML` or `outerHTML` to render user-supplied or API-derived data.** Use `element.textContent` for text and DOM construction methods (`createElement`, `appendChild`) for structured HTML.
- **Never use `document.write()`.**
- **Never use `eval()`, `new Function()`, or `setTimeout(str)` with a string argument.**
- When rendering tool results from API responses, every field must go through `textContent` or equivalent safe assignment. This applies even to fields that "look safe" (e.g., domain names, IP addresses, header values — all can contain `<script>` tags if an attacker controls the upstream data).
- Exception: the `marked` library is used at build time only, and its HTML output is embedded in `*-content.js` as a pre-sanitized string. The docs and writes renderers set `innerHTML` on a sandboxed container because the content is author-controlled Markdown, not user input. Do not extend this exception.

### 5.2 Server-Side (Workers / Functions)

- **No fetch to attacker-controlled URLs.** All outbound fetches from Workers must target hardcoded service URLs (DoH resolver, RDAP, crt.sh, ipwho.is). Never construct a fetch URL from user input directly.
- **SSRF prevention is mandatory for any function that fetches on behalf of user input.** The pattern is: validate scheme (http/https only), block private/reserved IP ranges via the `isPrivateAddress` helpers in `functions/lib/ip.js`, then perform a DoH pre-resolution check to catch hostname → private IP resolution. See `functions/api/link.js` for the canonical implementation.
- **Input validation must happen before any processing.** Validate at the entry point of every `onRequestGet` handler. Return a `400` with a plain error message if input is invalid. Never trust query parameters.
- **CORS is restricted to `https://kapadia.org`.** All API responses must include `Access-Control-Allow-Origin: https://kapadia.org` and `Cache-Control: no-store`. Use the `cors()` helper pattern established in existing functions.
- **Never log or echo user inputs in error messages.** Error messages must describe the problem category, not reflect the attacker's input back.
- **`onRequestOptions` must be exported from every API function** to handle CORS preflight. Follow the existing pattern exactly.

### 5.3 File Handling (Client-Side Tools)

- **Enforce file size limits before any processing.** Existing tools use 50 MB for images, 2 GB for hash. Choose an appropriate limit for any new file-handling tool and reject files exceeding it before reading them.
- **Validate file types via magic bytes, not the `accept` attribute or `file.type`.** The `accept` attribute and `file.type` are bypassable. Read the first 12 bytes of the file and check the known magic byte sequences. See `functions/api/exif.js` → `detectImageType()` for the canonical implementation.
- **For canvas-based image processing, use `createImageBitmap(file)` instead of `URL.createObjectURL()` + `new Image()`.** The server's CSP blocks `blob:` in `img-src`, so the `Image()` approach fires `onerror` for valid files. `createImageBitmap()` decodes directly from the `File` object without a URL. Always call `bitmap.close()` in a `finally` block.
- **Sanitize download filenames** to safe characters only. See `sanitizeName()` in `public/js/tools/exif.js`.
- **Revoke object URLs promptly** after initiating downloads. See `downloadBlob()` in exif.js.

### 5.4 Content Security Policy

The CSP is defined in `public/_headers` and applies to every page served from `kapadia.org`:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' '<sha512-hash-of-spark-md5>';
  style-src 'self' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self' https://speed.cloudflare.com;
  frame-ancestors 'self';
  base-uri 'none';
  form-action 'none';
  manifest-src 'self';
  object-src 'none';
  upgrade-insecure-requests
```

**Rules derived from this CSP:**

- `script-src` allows only `'self'` plus a specific SHA-512 hash for SparkMD5 from cdnjs. If you add a new inline script or a new CDN script, you must update `_headers` with the correct SHA-512 hash. Hash the exact script content: `openssl dgst -sha512 -binary <file> | openssl base64 -A`.
- `img-src` does **not** include `blob:`. This is why `createImageBitmap()` is required for canvas operations — `new Image()` + `blob:` URL will fail silently.
- `connect-src` only allows `'self'` and `https://speed.cloudflare.com`. Client-side tools that need network data must route through a Worker function (`/api/*`), not fetch external services directly. If a new tool needs a new external `connect-src`, update `_headers` and document why.
- `form-action 'none'` means no HTML form submissions. Use JS event handlers instead.
- No `unsafe-inline` for scripts or styles, ever.

### 5.5 Supply Chain

- **Vendor scripts must be served from `/public/js/vendor/`**, not from CDN URLs in `script-src`, unless the CDN URL is already in the CSP and the script has an SRI hash.
- **SRI (`integrity` attribute) is required on every third-party `<script>` tag.** The existing SparkMD5 tag on hash.html is the model. Algorithm must be `sha512`.
- **Pin versions in SRI hashes.** Never use a floating version like `@latest`.
- When adding a new vendor dependency: download the minified file, verify it, place it in `public/js/vendor/`, update `_headers` if needed, add `integrity` and `crossorigin="anonymous"` to the `<script>` tag.

### 5.6 Privacy

- **No analytics, no tracking pixels, no cookies, no session storage.**
- **No third-party requests from pages other than Google Fonts.** Tools that need data must proxy through Workers.
- **`Referrer-Policy: strict-origin-when-cross-origin`** is set globally in `_headers`. Never weaken it.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=()`** is set globally. Any new browser capability must be explicitly added only if required, with justification.

---

## 6. Design System

### 6.1 Typography

Three fonts, loaded from Google Fonts. Never add more:

| Variable | Font | Use |
|---|---|---|
| `--font-display` | Cormorant Garamond | Page titles (`.page-title`), tool names, card titles. Weights: 300, 400, 600. |
| `--font-body` | DM Sans | Body text, descriptions, labels. Weight 300 primary. |
| `--font-mono` | JetBrains Mono | All code, values, labels, navigation, footer, form inputs, output blocks. |

**Rules:**
- Navigation links use `--font-mono`.
- All form elements (`<input>`, `<textarea>`, `<select>`, buttons) use `--font-mono`.
- Output areas (hash values, decoded JWT, DNS records) use `--font-mono`.
- Eyebrow labels above page titles use `--font-mono` at `0.6875rem`, uppercase, `letter-spacing: 0.1em`.
- Body copy uses `--font-body`.
- `<h1>` on tool pages uses `--font-display`, `1.75rem`, weight 400.
- Page-level `<h1>` uses `--font-display`, `clamp(2rem, 5vw, 3.5rem)`, weight 300.

### 6.2 Color Tokens

All colors are CSS custom properties on `:root`. **Never hardcode a color value in a component stylesheet.** Always use the token.

**Core palette (light / auto-dark via `prefers-color-scheme`):**

```css
--bg              /* page background */
--bg-raised       /* card and container backgrounds */
--bg-terminal     /* terminal/output block background (#151512 / #0c0c0b) */
--bg-code         /* inline code background */
--text            /* primary text */
--text-muted      /* secondary text */
--text-faint      /* tertiary/disabled text */
--border          /* subtle borders */
--border-strong   /* input borders */
```

**Terminal palette (always vivid — terminal bg is always dark regardless of mode):**

```css
--term-green      /* primary accent, focus ring, success states */
--term-dim        /* dimmed green — output labels */
--term-cmd        /* terminal command text */
--term-link       /* links inside terminals */
--term-data       /* data values in output blocks */
--term-cursor     /* blinking cursor */
```

**Semantic / state tokens:**

```css
--color-success          /* #78b89c */
--color-warning          /* #cfb16f */
--color-warning-alt      /* #cf9a6f */
--color-error            /* #cf6f6f */
--color-error-border     /* rgba version */
--color-error-bg         /* rgba version */
```

**Doc/article accent tokens** (used in `/docs/` and `/writes/` only):

```css
--doc-h1  --doc-h2  --doc-h3  --doc-h4
--doc-link  --doc-link-bg
--doc-code-text  --doc-code-bg
--doc-blockquote  --doc-blockquote-border
--doc-table-hd  --doc-bold  --doc-mark
```

**Animation tokens:**

```css
--anim-duration: 0.6s
--anim-ease: ease
--anim-reveal: var(--anim-duration) var(--anim-ease) forwards
--transition: 200ms ease
```

### 6.3 Layout

- Maximum content width: `53.75rem` (860px). Always apply via `.container` or inline on `.nav-inner` / `.footer-inner`. Never exceed this.
- Container padding: `0 1.125rem` on desktop, `0 1rem` on mobile (`max-width: 40rem`).
- Navigation height: `3.375rem`. `main` has `padding-top: calc(3.375rem + env(safe-area-inset-top, 0px))` to clear the fixed nav.
- Mobile breakpoint: `max-width: 40rem` (640px). This is the only breakpoint used site-wide.
- Border radius: `--radius: 0.25rem` for all elements. Not `0.5rem`, not `0.375rem` (alerts are the exception at `0.375rem`).
- Border width: `--border-w: 0.0625rem` (1px).

### 6.4 Grain Overlay

Every page has a fixed grain texture applied via `body::before` using an SVG `feTurbulence` filter at `opacity: 0.45`. This is defined in `shared.css` and applies globally. **Do not remove or override it.**

The grain overlay is at `z-index: 9999`. The navigation is at `z-index: 10000`. Any modal, tooltip, or overlay you create must be layered above `10000` if it needs to appear over the nav, or below `9999` if it should be beneath the grain.

### 6.5 Animations

Pages and tool containers enter with `fadeUp` (`opacity: 0 → 1`, `translateY(0.75rem → 0)`). Apply to page-level containers via:

```css
opacity: 0;
animation: fadeUp var(--anim-reveal);
```

Use `animation-delay` (e.g., `0.15s`) to stagger multiple sections. Never use JavaScript for entry animations that CSS can handle.

---

## 7. HTML Conventions

### 7.1 Page Template

Every page must follow this exact structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="description" content="..." />
  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://kapadia.org/path/" />
  <meta property="og:title" content="Page Title — kapadia.org" />
  <meta property="og:description" content="..." />
  <meta property="og:site_name" content="kapadia.org" />
  <!-- Twitter card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Page Title — kapadia.org" />
  <meta name="twitter:description" content="..." />
  <title>Page Title — kapadia.org</title>
  <link rel="canonical" href="https://kapadia.org/path/" />
  <!-- Google Fonts (same URL every time — do not alter the font URL) -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@300;400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/shared.css" />
  <link rel="stylesheet" href="/css/page-specific.css" />
</head>
<body>
  <!-- Navigation -->
  <nav aria-label="Main Navigation">
    <div class="nav-inner">
      <a href="/" class="nav-logo" aria-label="kapadia.org homepage">kapadia<span>.org</span></a>
      <ul class="nav-links">
        <li><a href="/">~</a></li>
        <li><a href="/tools/">tools</a></li>
        <li><a href="/docs/">docs</a></li>
        <li><a href="/writes/">writes</a></li>
        <li><a href="/about/">about</a></li>
      </ul>
    </div>
  </nav>

  <main>
    <div class="container">
      <!-- page content -->
    </div>
  </main>

  <footer role="contentinfo" aria-label="Site Footer">
    <div class="footer-inner">
      <span class="footer-left">© kapadia.org</span>
      <nav class="footer-right" aria-label="Footer Navigation">
        <a href="/">~</a>
        <a href="/tools/">tools</a>
        <a href="/docs/">docs</a>
        <a href="/writes/">writes</a>
        <a href="/about/">about</a>
        <a href="/privacy/">privacy</a>
        <a href="https://github.com/dekay7/kapadia" target="_blank" rel="noopener noreferrer">github</a>
      </nav>
    </div>
  </footer>

  <script src="/js/page.js" defer></script>
</body>
</html>
```

**Rules:**
- All `<script>` tags go at the bottom of `<body>` with `defer`. Never in `<head>`.
- The Google Fonts `<link>` URL must be identical across all pages. Never alter or shorten it.
- The nav link with `aria-current="page"` must match the current section. For tool pages it is the "tools" link.
- External links must always include `rel="noopener noreferrer"`.
- The footer nav is identical across all pages. The only allowed per-page variation is adding `aria-current="page"` to the matching link.

### 7.2 Tool Page Template

Tool pages use a `.tools-page` container and a `.tool-container` card:

```html
<main>
  <div class="container tools-page">
    <div class="tool-container">
      <div class="tool-header">
        <h1>Tool Name</h1>
        <p class="tool-desc">One-sentence description. Mention privacy/where computation runs.</p>
      </div>

      <div class="tool-disclaimer">
        <strong>Privacy:</strong> Explain exactly what data leaves (or doesn't leave) the device.
        Name any third-party libraries used and how they are loaded.
      </div>

      <!-- tool UI here -->
    </div>
  </div>
</main>
```

The `.tool-disclaimer` block is **mandatory** on every tool page. Users deserve to know what happens to their data. Be specific: "Runs 100% in your browser" or "This check is performed server-side at the edge — your query is not stored."

### 7.3 `<noscript>` Fallback

Every tool page must include:

```html
<noscript>
  <div class="noscript-msg">This tool requires JavaScript to function.<br>Enable JS and reload to use it.</div>
</noscript>
```

Place it as the first child of `<body>`.

### 7.4 Semantic HTML

- Use `<main>` for the primary content area. One per page.
- Use `<nav>` with `aria-label` for navigation landmarks.
- Use `<footer>` with `role="contentinfo"` and `aria-label`.
- Use `<header>` inside `<main>` for page headers.
- Use `<section>` for distinct content groups. Give each a meaningful `aria-label` if there are multiple.
- Use `<button>` (not `<div>` or `<a>`) for all interactive controls that don't navigate. Set `type="button"` explicitly.
- Use `<label>` with `for` pointing to the input's `id` for all form fields.

---

## 8. CSS Conventions

### 8.1 File Organization

- `public/css/shared.css` — reset, CSS variables, nav, footer, animations, utilities. Included on every page.
- `public/css/tools.css` — tool container, form elements, output blocks, risk badges. Included on all tool pages.
- `public/css/docs.css` — docs sidebar, Markdown rendering. Included on `/docs/` only.
- `public/css/writes.css` — essay list, article reading styles. Included on `/writes/` only.
- `public/css/<page>.css` — page-specific overrides only. Create a new file when a page needs styles that don't belong in the shared files.

**Never add tool-specific styles to `shared.css`.** Never add page-specific styles to `tools.css`.

### 8.2 Writing CSS

- Use CSS custom properties (the tokens from Section 6.2) for all colors, spacings, and transitions. No hardcoded hex values in component styles.
- Avoid nesting beyond two levels. CSS is flat; keep it flat.
- All measurements in `rem`, not `px`, unless it is a `border-width` (`0.0625rem` = 1px) or a `box-shadow` blur that visually needs pixels. The base is `16px`.
- The single responsive breakpoint is `@media (max-width: 40rem)`. No other breakpoints exist.
- Utility classes from `shared.css` are available:
  - `.u-hidden` — `display: none`
  - `.u-flex`, `.u-align-center`, `.u-gap-8`, `.u-flex-1`, `.u-flex-2`
  - `.u-mt-8`, `.u-mt-16`, `.u-mt-24`, `.u-mb-8`, `.u-mb-24`
  - `.u-mono`, `.u-faint`, `.u-small`, `.u-text-muted`, `.u-text-center`, `.u-text-dim`, `.u-text-green`, `.u-text-error`
  - `.u-mobile-hidden`
  - `.sr-only` — screen-reader only (visually hidden)

### 8.3 Focus Styles

The global focus style is defined in `shared.css`:

```css
:focus-visible {
  outline: 0.125rem solid var(--term-green);
  outline-offset: 0.25rem;
}
```

**Never suppress or override `:focus-visible` with `outline: none` on interactive elements.** You may suppress the outline on elements that handle `:focus` (not `:focus-visible`) if the hover state provides sufficient visual feedback, using `a:hover:not(:focus-visible)` or similar — but this must be deliberate and justified.

### 8.4 Risk Badges

The `.risk-badge` system is defined in `tools.css` and must be used consistently across all tools for signal/severity displays:

```
.risk-critical  → --color-error (red)
.risk-high      → --color-warning-alt (orange)
.risk-medium    → --color-warning (yellow)
.risk-low       → --term-data (blue-grey)
.risk-info      → --text-faint (grey, no background)
```

---

## 9. JavaScript Conventions (Client-Side)

### 9.1 Module Pattern

All client-side scripts use an IIFE or a top-level `DOMContentLoaded` listener. No ES module imports — the CSP does not allow `type="module"` unless it is explicitly added to `script-src` (it is not currently). Keep it as `defer` scripts.

```javascript
// Pattern A — for tools that run entirely after DOM load
document.addEventListener('DOMContentLoaded', () => {
  // ...
});

// Pattern B — IIFE with 'use strict', preferred when the file is self-contained
(function () {
  'use strict';
  // ...
})();
```

### 9.2 DOM Safety

- **Always use `textContent` for untrusted or user-derived values.** Never use `innerHTML` for data from API responses, user inputs, file metadata, or URL parameters.
- **Build structured output with `document.createElement` + `appendChild`.** Do not concatenate HTML strings.
- When you must render author-controlled Markdown HTML (only in docs and writes renderers), assign to `innerHTML` on a dedicated sandboxed container element, never on `document.body` or a shared element.
- Always use `element.replaceChildren()` to clear a container rather than setting `innerHTML = ''`. Both are safe here but `replaceChildren()` is explicit about DOM intent.

### 9.3 Async Pattern

Use `async/await` with `try/catch`. Never use raw `.then()/.catch()` chains for new code. Use `Promise.allSettled()` when firing multiple independent requests so one failure does not block the rest.

### 9.4 Error Handling

Show user-facing error messages using `element.textContent = message` — never render error strings as HTML. Error messages must not include internal stack traces. A short, helpful description of what went wrong is sufficient.

### 9.5 No Global Namespace Pollution

Wrap all code in an IIFE or `DOMContentLoaded` handler. Do not assign anything to `window` unless a script on a different page genuinely needs to call it (none currently do).

### 9.6 Performance

- All network calls to `/api/*` should be fired as soon as valid input is available, not on form submit.
- Use `Promise.allSettled` for parallel independent fetches (see osint.js client).
- Do not block the main thread during file processing. Use `FileReader.onload` with `async` callbacks.
- Do not add `scroll` or `resize` event listeners without debouncing.

---

## 10. Workers / Functions Conventions (Server-Side)

### 10.1 File Structure

Every `functions/api/*.js` file must export exactly:
- `export async function onRequestGet(context)` — handles GET requests
- `export async function onRequestOptions()` — handles CORS preflight

No other exports. No `onRequestPost` unless a new feature genuinely requires POST (discuss first).

### 10.2 Request Handling Pattern

```javascript
export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const param = searchParams.get('param');

  // 1. Validate all inputs immediately
  if (!param) return cors({ error: 'Missing required parameter "param".' }, 400);
  if (!isValid(param)) return cors({ error: 'Invalid param format.' }, 400);

  // 2. Process (with error boundary)
  try {
    const data = await doWork(param);
    return cors({ data });
  } catch (err) {
    return cors({ error: 'Internal error.' }, 500);
  }
}

function cors(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://kapadia.org',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  'https://kapadia.org',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}
```

### 10.3 Edge Data

Cloudflare provides visitor geo/ASN data via `context.request.cf`. Use it for the connecting visitor's metadata (see `functions/api/info.js`). Do not use it to infer the target of a user query — use DoH or the appropriate service for that.

### 10.4 Timeouts

Every outbound `fetch` inside a Worker must have a timeout via `AbortSignal.timeout(ms)`. Never make an unbounded network request. Reasonable defaults: 4 seconds for DNS, 5 seconds for RDAP, 8 seconds for HTTP inspection hops.

### 10.5 Shared Library

Functions that are shared between multiple Workers (e.g., IP parsing) live in `functions/lib/ip.js`. Import from there via relative path. Do not duplicate utility logic between files.

---

## 11. Adding a New Tool

Follow these steps exactly to add a new tool. Each step is required:

### Step 1 — Determine where computation runs

| Computation type | Where to run |
|---|---|
| String manipulation, encoding/decoding, hashing | Client-side only |
| File processing | Client-side only |
| DNS, IP geolocation, external service queries | Worker function |
| HTTP header/response inspection | Worker function |
| Data that requires network stack info (TLS, IP) | Worker function |

If it can be client-side, make it client-side. A Worker function is only warranted when JS running in the browser cannot access the data.

### Step 2 — Create the Worker function (if needed)

Create `functions/api/<toolname>.js`. Follow the pattern in Section 10. Document security considerations in a JSDoc comment at the top of the file (scheme validation, SSRF prevention, input validation, data flow). See `functions/api/link.js` for a comprehensive example.

### Step 3 — Create the HTML page

Create `public/tools/<toolname>/index.html`. Follow the tool page template in Section 7.2. Required elements:
- Correct `<title>`, `<meta description>`, Open Graph tags, canonical URL.
- `<noscript>` fallback.
- Navigation with `aria-current="page"` on "tools".
- `.tool-container` with `.tool-header` and `.tool-disclaimer`.
- Footer identical to all other pages.
- `<script src="/js/tools/<toolname>.js" defer>` at end of `<body>`.

### Step 4 — Create the JavaScript file

Create `public/js/tools/<toolname>.js`. Follow the conventions in Section 9. Key requirements:
- All untrusted values through `textContent`.
- Error messages as `textContent`, never as HTML.
- Network requests to `/api/<toolname>` only.
- File inputs validated by size and magic bytes before processing.

### Step 5 — Add to the tools index

Open `public/tools/index.html` and add a new `.tool-card` in the grid. Follow the existing card pattern:

```html
<a href="/tools/<toolname>/" class="tool-card">
  <span class="tool-icon">## &nbsp;/tools/<toolname></span>
  <h2 class="tool-title">Tool Display Name</h2>
  <p class="tool-desc">One-sentence description of what the tool does.</p>
  <span class="card-arrow">&rarr;</span>
</a>
```

The `##` in `tool-icon` is a two-digit sequential number. Use the next available number.

**`.tool-desc` rules:**
- One short sentence. No em dashes.
- End with exactly one of these suffixes based on where computation runs:
  - `No data sent.` — tool runs entirely in the browser; nothing leaves the device.
  - `Self-hosted.` — data is sent to kapadia.org's own edge infrastructure (a Worker function).
  - No suffix — data is sent to a third-party service (e.g., Speed Test uses Cloudflare's servers).

### Step 6 — Add to navigation tab-completion (optional)

If the tool should be reachable by typing `cd tools` or `cd <toolname>` in the homepage terminal, add it to the `COMMANDS` map in `public/js/index.js`:

```javascript
const COMMANDS = Object.freeze({
  '<toolname>': '/tools/<toolname>/',
  // ...
});
```

### Step 7 — Add documentation

Create `content/docs/tool-<toolname>.md` with the appropriate frontmatter:

```markdown
---
title: Tool Name
breadcrumb: docs / tools / tool-name
sidebar_section: Technology Tools
sidebar_order: <next integer>
---
```

Run `npm run render` to regenerate `docs-content.js`.

### Step 8a — Update site structure documentation

Whenever a new page or tool is added, update `README.md` in the same commit: add a bullet to the Features list and an entry to the Project Structure tree under `public/tools/`. The tools hub card and terminal tab-completion are auto-generated from the doc frontmatter — no other files need updating.

### Step 8b — Security review before shipping

Before committing, answer each question:
1. What is every path by which user input enters the system?
2. How is each input validated (scheme, format, range, type)?
3. Is any user input reflected to the DOM? If yes, is it via `textContent` only?
4. Does the Worker make any outbound fetches? If yes, are all URLs hardcoded or SSRF-checked?
5. Is the CORS header restricted to `https://kapadia.org`?
6. Are there any new CDN scripts? If yes, do they have SRI hashes?
7. Does any new `connect-src` need to be added to `_headers`?

---

## 12. Adding Documentation

1. Create `content/docs/<slug>.md`.
2. Add YAML frontmatter:

```markdown
---
title: Page Title
breadcrumb: docs / section / page
sidebar_section: Overview | Site Guides | Technology Tools | Technical Reference
sidebar_order: <integer>
sidebar_label: Optional override for sidebar button text
---
```

3. Run `npm run render`. This regenerates `public/js/docs-content.js`.
4. Commit both the `.md` file and the regenerated `docs-content.js`.

Supported Markdown features: headings, paragraphs, bold, italic, code blocks (fenced), inline code, links, tables, blockquotes, unordered/ordered lists, GitHub-flavored alert blocks (`> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!CAUTION]`).

---

## 13. Adding Write-ups

1. Create `content/writes/<slug>.md`.
2. Add YAML frontmatter:

```markdown
---
title: Post Title
excerpt: Short description shown in the list view.
date: YYYY-MM
readTime: N min
tags: tag1, tag2, tag3
---
```

3. Run `npm run render`. This regenerates `public/js/writes-content.js`.
4. Commit both the `.md` file and the regenerated `writes-content.js`.

Write-ups appear sorted by `date` descending. No changes to `writes.js` or HTML are needed.

---

## 14. Accessibility Requirements

These are not optional. They are structural requirements.

- **Every interactive element must be keyboard-reachable** and must show the `:focus-visible` ring when focused with a keyboard.
- **Every image must have an `alt` attribute.** Decorative images use `alt=""`. Informative images must describe their content.
- **Every form input must have an associated `<label>`.** Either use `for`/`id` pairing, or wrap the input in the label. Never use `placeholder` as a substitute for a label.
- **Buttons that trigger actions must have `type="button"`.** Omitting `type` defaults to `type="submit"` and can cause unintended form submissions.
- **Custom interactive elements** (e.g., file cards, custom list items acting as buttons) must have `role="button"`, `tabindex="0"`, and `keydown` handlers for `Enter` and `Space`. See the EXIF file card in `exif.js` for the canonical implementation.
- **ARIA labels** on `<nav>`, `<footer>`, and `<section>` landmarks. Multiple nav elements on a page must each have a distinct `aria-label`.
- **Visibility toggling must use CSS classes** (`.u-hidden` / `classList.remove('u-hidden')`), not inline `style.display`. This keeps screen reader behavior predictable.
- **The `.sr-only` class** is available for text that should be read by screen readers but not displayed visually. Use it for supplementary context on icon-only controls.
- **Focus management after dynamic content.** When a result panel renders after an async operation, move focus to the first meaningful element in the result using `element.focus()` inside a `requestAnimationFrame` callback (see `exif.js` → `renderAll()`).
- **`aria-busy="true"`** must be set on a button while its associated async operation is in progress, and removed when complete.
- **Loading states** must be communicated to screen readers. Use a live region (`aria-live="polite"`) or manage focus so the screen reader announces the result.

---

## 15. What Not to Do

This is an explicit list of anti-patterns. Do not introduce any of these:

- **No frameworks.** Not React, Vue, Svelte, HTMX, Alpine, jQuery, or anything equivalent.
- **No build tools** (webpack, Vite, Rollup, esbuild, Parcel) for static assets.
- **No CSS preprocessors** (Sass, Less, PostCSS).
- **No TypeScript** or any compile-to-JS language.
- **No CSS frameworks** (Tailwind, Bootstrap, Bulma).
- **No `innerHTML` with untrusted data,** ever.
- **No eval, new Function, or setTimeout/setInterval with a string argument.**
- **No `console.log` left in committed code.** Use `console.error` only inside error handlers, and only for errors that indicate a programming bug (not expected network failures).
- **No cookies, localStorage, or sessionStorage.** The site is stateless and privacy-first.
- **No inline `style` attributes** for layout or theme properties. Use CSS classes. Inline `style` is acceptable only for dynamically computed values (e.g., a pixel position calculated in JS).
- **No hardcoded colors** in per-component CSS. Use CSS custom properties.
- **No new fonts.** The three fonts (Cormorant Garamond, DM Sans, JetBrains Mono) are fixed.
- **No analytics, tracking scripts, or third-party SDKs.**
- **No form `action` attributes** (CSP blocks them; use JS).
- **No `target="_blank"` without `rel="noopener noreferrer"`.**
- **No `<script type="module">` in HTML files** unless `script-src` is updated to allow it.
- **No `--no-verify` on git commits.**
- **No force-push to `master`.**
- **No amending published commits.**
- **No new pages outside `public/`** — everything served must be in `public/`.
- **No state stored in the Worker.** Workers are stateless; do not rely on in-memory state between requests.

---

## 16. Patterns to Preserve

These patterns exist for specific technical reasons. Do not change them without understanding the reason.

- **`createImageBitmap(file)` for canvas image decoding.** `blob:` URLs are blocked by `img-src` in the CSP. `createImageBitmap()` bypasses this. `bitmap.close()` in `finally` is mandatory to release GPU memory.
- **DoH pre-resolution before any fetch in Workers.** Prevents SSRF via DNS rebinding. Resolve the hostname via Cloudflare DoH and check all returned IPs against private ranges before making the actual request.
- **`redirect: 'manual'` in link inspector fetches.** Following redirects automatically would bypass per-hop SSRF validation. Each hop is individually validated.
- **`ACCESS-Control-Allow-Origin: https://kapadia.org` (exact, not `*`).** Wildcard CORS would allow any origin to read API responses, which could leak visitor data or be abused.
- **`Cache-Control: no-store` on all API responses.** API data is per-visitor (IP, geolocation). It must not be shared across visitors via a shared cache.
- **`check-sync.js` build guard.** The `_middleware.js` and `http-handler.js` files share helper functions that must stay in sync. The build guard fails CI if they drift.
- **`exifr` vendored in `/public/js/vendor/`.** If served from cdnjs, it would require either a CDN `script-src` or a SHA-512 hash in the CSP. Vendoring it under `'self'` is cleaner and avoids a CDN dependency for a large library.
- **`AbortSignal.timeout(ms)` on all Worker outbound fetches.** Workers have a CPU time limit. An unbounded fetch blocks the CPU budget and may cause the request to timeout for the user.
- **`body::before` grain overlay at `z-index: 9999`.** Nav at `z-index: 10000` was specifically chosen to exceed the grain. Do not change either value without updating the other.
- **Navigation on `env(safe-area-inset-top)`.** Supports devices with notches (iPhone). `main` padding-top matches. Do not remove.

---

## 17. Commit & Review Checklist

Before every commit, verify:

- [ ] No `innerHTML` with external or user data
- [ ] No hardcoded colors (use CSS custom properties)
- [ ] No new fonts, frameworks, or build tools
- [ ] `_headers` updated if new `connect-src`, `script-src` hash, or `img-src` value is needed
- [ ] All `<script>` tags with CDN sources have `integrity` (SHA-512) and `crossorigin="anonymous"`
- [ ] All new Worker functions export `onRequestGet` and `onRequestOptions`
- [ ] All new Worker functions have `Cache-Control: no-store` and `Access-Control-Allow-Origin: https://kapadia.org`
- [ ] All outbound Worker fetches have `AbortSignal.timeout(ms)`
- [ ] Input validation happens before any processing in Worker handlers
- [ ] File inputs have size limits and magic-byte validation
- [ ] All interactive elements are keyboard-accessible
- [ ] All form inputs have `<label>` elements
- [ ] The `<noscript>` fallback is present on all tool pages
- [ ] The `.tool-disclaimer` block is present on all tool pages
- [ ] New Markdown content has been rendered (`npm run render`) and `*-content.js` is committed
- [ ] `README.md` updated to include the new tool/page (features list + project structure tree)
- [ ] No `console.log` in committed code
- [ ] No cookies, localStorage, sessionStorage

---

## 18. Local Environment Quick-Start

```bash
# Install devDependencies (marked, wrangler)
npm install

# Render Markdown content (required before first run and after any content change)
npm run render

# Start local dev server on port 8788
npm run dev

# Open http://localhost:8788
```

The GitHub → Cloudflare Pages integration handles production. You do not need to run `wrangler pages deploy` manually.
