import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('CV timeline filters retain a mode-aware selected state', async () => {
  const css = await read('public/css/cv.css');
  const activeRule = css.match(/\.filter-button\.is-active\s*\{([^}]*)\}/);

  assert.ok(activeRule, 'the selected filter rule must exist');
  assert.match(activeRule[1], /background:\s*var\(--bg-hover-green\)/);
  assert.match(activeRule[1], /border-color:\s*var\(--term-dim\)/);
  assert.match(activeRule[1], /color:\s*var\(--text\)/);
  assert.doesNotMatch(activeRule[1], /--bg-terminal/);
});
