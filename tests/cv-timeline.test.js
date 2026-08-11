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

test('CV timeline dots align to the progress line and fill only after progress reaches them', async () => {
  const [css, script] = await Promise.all([
    read('public/css/cv.css'),
    read('public/js/cv.js'),
  ]);
  const dotRule = css.match(/\.timeline-entry::before\s*\{([^}]*)\}/);
  const filledDotRule = css.match(/\.timeline-entry\.is-past::before\s*\{([^}]*)\}/);

  assert.ok(dotRule, 'the timeline dot rule must exist');
  assert.match(dotRule[1], /left:\s*-6\.125rem/);
  assert.match(dotRule[1], /background:\s*var\(--bg\)/);
  assert.ok(filledDotRule, 'a completed timeline dot rule must exist');
  assert.match(filledDotRule[1], /background:\s*var\(--term-green\)/);
  assert.match(script, /entry\.classList\.toggle\('is-past'/);
  assert.match(script, /entry\.offsetTop \+ dotCenterOffset <= visibleHeight/);
});
