import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const forbidden = /(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\.log)/;

test('quarantine page provides local privacy, accessible controls, and module UI', async () => {
  const html = await read('public/tools/quarantine/index.html');
  assert.match(html, /<title>Command Quarantine — kapadia\.org<\/title>/);
  assert.match(html, /https:\/\/kapadia\.org\/tools\/quarantine\//);
  assert.match(html, /processed locally, never executed, transmitted, or stored/i);
  assert.match(html, /<label for="quarantine-input"/);
  assert.match(html, /maxlength="32768"/);
  assert.match(html, /id="quarantine-results"[^>]*tabindex="-1"/);
  assert.match(html, /role="status"/);
  assert.match(html, /type="module" src="\/js\/tools\/quarantine\.js"/);
  assert.match(html, /<noscript>/);
});

test('new quarantine code forbids unsafe DOM, execution, network, storage, and automatic clipboard APIs', async () => {
  const files = await Promise.all(['public/js/tools/quarantine-core.js', 'public/js/tools/quarantine.js'].map(read));
  for (const source of files) assert.doesNotMatch(source, forbidden);
  assert.match(files[1], /from '\.\/quarantine-core\.js'/);
  assert.doesNotMatch(files[1], /CQ00\d/);
});

test('Command Quarantine has documented local-only integration', async () => {
  const [doc, readme] = await Promise.all([read('content/docs/tool-quarantine.md'), read('README.md')]);
  assert.match(doc, /title: Command Quarantine/);
  assert.match(doc, /tool_suffix: No data sent\./);
  assert.match(doc, /CQ001/);
  assert.match(doc, /CQ014/);
  assert.match(readme, /Command Quarantine/);
});
