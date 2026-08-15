import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('About page introduces the CV before the project description', async () => {
  const html = await read('public/about/index.html');
  const cvLinkIndex = html.indexOf('<a href="/about/cv/" class="cv-link-box">');
  const descriptionIndex = html.indexOf('kapadia.org is where I publish');

  assert.ok(cvLinkIndex >= 0, 'the professional experience link must exist');
  assert.ok(descriptionIndex >= 0, 'the updated project description must exist');
  assert.ok(cvLinkIndex < descriptionIndex, 'the professional experience link must precede the project description');
});

test('About page describes the current site in direct, human prose', async () => {
  const html = await read('public/about/index.html');
  const content = html.slice(html.indexOf('<div class="about-content">'), html.indexOf('</main>'));
  const text = content.replace(/\s+/g, ' ');

  assert.match(text, /security tools, research notes, and technical writing/);
  assert.match(text, /browser-based diagnostics, documentation, essays, and a terminal interface/);
  assert.match(text, /There are no cookies, trackers, or advertising\./);
  assert.match(text, /carefully scoped edge functions/);
  assert.doesNotMatch(content, /—/);
  assert.doesNotMatch(content, /not just/i);
});

test('About CV card relies on shared header spacing', async () => {
  const css = await read('public/css/about.css');
  const cardRule = css.match(/\.cv-link-box\s*\{([^}]*)\}/);

  assert.ok(cardRule, 'the CV card rule must exist');
  assert.doesNotMatch(
    cardRule[1],
    /(?:^|\n)\s*margin-top\s*:/,
    'the card must not add space after the shared page header'
  );
});
