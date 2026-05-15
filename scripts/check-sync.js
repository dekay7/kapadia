/**
 * Build-time check: verifies that the isCliClient, ipVersion, and getConnectingIP
 * helper functions in functions/_middleware.js and http-handler.js are identical.
 *
 * These functions are intentionally duplicated because Cloudflare Pages
 * Functions and standalone Workers cannot share module files. This script
 * fails the build if either copy drifts from the other.
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

const middlewareSrc = readFileSync(join(root, 'functions/_middleware.js'), 'utf-8');
const handlerSrc    = readFileSync(join(root, 'http-handler.js'),           'utf-8');

const funcs = ['isCliClient', 'ipVersion', 'getConnectingIP'];
let failed = false;

for (const name of funcs) {
  const a = extractFunction(middlewareSrc, name);
  const b = extractFunction(handlerSrc,    name);
  if (hash(a) !== hash(b)) {
    console.error(`\n[check-sync] FAIL: "${name}" differs between functions/_middleware.js and http-handler.js`);
    console.error(`  _middleware.js : ${a}`);
    console.error(`  http-handler.js: ${b}\n`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('[check-sync] OK: isCliClient, ipVersion, and getConnectingIP are in sync.');
}
