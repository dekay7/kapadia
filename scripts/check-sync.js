/**
 * Build-time check: verifies intentionally-duplicated code stays in sync.
 *
 * Check 1 — CLI helpers:
 *   isCliClient, ipVersion, getConnectingIP must be identical between
 *   functions/_middleware.js and http-handler.js.
 *
 * Check 2 — Job filter:
 *   KEYWORDS and categorize() must be identical between
 *   functions/lib/jobs-filter.js and job-digest.js.
 *
 * Standalone Workers cannot import Pages Function lib files, so these
 * are intentionally duplicated. This script fails the build if either
 * copy drifts from the other.
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

function extractConst(src, name) {
  // Match `const name = ...` up to the first semicolon at depth 0
  const marker = `const ${name} =`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Const "${name}" not found`);
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1).replace(/\s+/g, ' ').trim();
    i++;
  }
  throw new Error(`Could not extract const "${name}"`);
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

// ── Check 2: Job filter ──────────────────────────────────────────────────────

const filterSrc = readFileSync(join(root, 'functions/lib/jobs-filter.js'), 'utf-8');
const digestSrc = readFileSync(join(root, 'job-digest.js'),                 'utf-8');

const kwA = extractConst(filterSrc, 'KEYWORDS');
const kwB = extractConst(digestSrc, 'KEYWORDS');
if (hash(kwA) !== hash(kwB)) {
  console.error('\n[check-sync] FAIL: KEYWORDS differs between functions/lib/jobs-filter.js and job-digest.js');
  failed = true;
}

const catA = extractFunction(filterSrc, 'categorize');
const catB = extractFunction(digestSrc, 'categorize');
if (hash(catA) !== hash(catB)) {
  console.error('\n[check-sync] FAIL: categorize() differs between functions/lib/jobs-filter.js and job-digest.js');
  failed = true;
}

// ────────────────────────────────────────────────────────────────────────────

if (failed) {
  process.exit(1);
} else {
  console.log('[check-sync] OK: isCliClient, ipVersion, getConnectingIP, KEYWORDS, and categorize are in sync.');
}
