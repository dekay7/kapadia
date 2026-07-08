/**
 * Build-time check: verifies intentionally-duplicated code stays in sync.
 *
 * Check 1 — CLI helpers:
 *   isCliClient, ipVersion, getConnectingIP must be identical between
 *   functions/_middleware.js and http-handler.js.
 *
 * Check 2 — curl-ip self-host template (http-handler):
 *   ipVersion, getConnectingIP in public/curl-ip/http-handler.js must match
 *   those in http-handler.js (root).
 *
 * Check 3 — curl-ip self-host template (middleware):
 *   ipVersion, getConnectingIP in public/curl-ip/middleware.js must match
 *   those in functions/_middleware.js.
 *
 * Standalone Workers cannot import Pages Function lib files, so these
 * are intentionally duplicated. This script fails the build if any
 * copy drifts from the others.
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function extractFunction(src, name) {
  // Match `function name(...) { ... }` handling nested braces
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function "${name}" not found`);
  let depth = 0;
  let i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1).replace(/\s+/g, ' ').trim();
    }
    i++;
  }
  throw new Error(`Could not extract function "${name}"`);
}

function hash(str) {
  return createHash('sha256').update(str).digest('hex');
}

let failed = false;

// ── Check 1: CLI helpers ─────────────────────────────────────────────────────

const middlewareSrc = readFileSync(join(root, 'functions/_middleware.js'), 'utf-8');
const handlerSrc    = readFileSync(join(root, 'http-handler.js'),           'utf-8');

for (const name of ['isCliClient', 'ipVersion', 'getConnectingIP']) {
  const a = extractFunction(middlewareSrc, name);
  const b = extractFunction(handlerSrc,    name);
  if (hash(a) !== hash(b)) {
    console.error(`\n[check-sync] FAIL: "${name}" differs between functions/_middleware.js and http-handler.js`);
    console.error(`  _middleware.js : ${a}`);
    console.error(`  http-handler.js: ${b}\n`);
    failed = true;
  }
}

// ── Check 2: curl-ip template — http-handler ─────────────────────────────────
// public/curl-ip/http-handler.js is a simplified self-hosting template. Its
// ipVersion and getConnectingIP helpers must stay in sync with the production
// copy in http-handler.js.

const curlHandlerSrc = readFileSync(join(root, 'public/curl-ip/http-handler.js'), 'utf-8');

for (const name of ['ipVersion', 'getConnectingIP']) {
  const a = extractFunction(handlerSrc,     name);
  const b = extractFunction(curlHandlerSrc, name);
  if (hash(a) !== hash(b)) {
    console.error(`\n[check-sync] FAIL: "${name}" differs between http-handler.js and public/curl-ip/http-handler.js`);
    console.error(`  http-handler.js               : ${a}`);
    console.error(`  public/curl-ip/http-handler.js: ${b}\n`);
    failed = true;
  }
}

// ── Check 3: curl-ip template — middleware ───────────────────────────────────
// public/curl-ip/middleware.js is a simplified self-hosting template. Its
// ipVersion and getConnectingIP helpers must stay in sync with the production
// copy in functions/_middleware.js.

const curlMiddlewareSrc = readFileSync(join(root, 'public/curl-ip/middleware.js'), 'utf-8');

for (const name of ['ipVersion', 'getConnectingIP']) {
  const a = extractFunction(middlewareSrc,     name);
  const b = extractFunction(curlMiddlewareSrc, name);
  if (hash(a) !== hash(b)) {
    console.error(`\n[check-sync] FAIL: "${name}" differs between functions/_middleware.js and public/curl-ip/middleware.js`);
    console.error(`  functions/_middleware.js      : ${a}`);
    console.error(`  public/curl-ip/middleware.js  : ${b}\n`);
    failed = true;
  }
}

// ────────────────────────────────────────────────────────────────────────────

if (failed) {
  process.exit(1);
} else {
  console.log('[check-sync] OK: isCliClient, ipVersion, getConnectingIP, and curl-ip templates are in sync.');
}
