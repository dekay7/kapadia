import { marked } from 'marked';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

function renderMarkdown(markdown) {
  let html = marked.parse(markdown, { gfm: true, breaks: false });
  for (const type of ALERT_TYPES) {
    const regex = new RegExp(
      `<blockquote>\\s*<p>\\s*\\[!${type}\\]([\\s\\S]*?)</p>\\s*</blockquote>`,
      'gi'
    );
    html = html.replace(regex, (_, content) =>
      `<div class="alert alert-${type.toLowerCase()}">` +
      `<div class="alert-title">${type}</div>` +
      `<div class="alert-content">${content.trim()}</div>` +
      `</div>`
    );
  }
  return html;
}

// Parse YAML-style frontmatter from a Markdown source string.
// Returns { meta: {key: value, ...}, body: string } where body is the
// content after the closing --- delimiter.
function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: match[2] };
}

function renderToolsMeta(contentDir, outputFile) {
  const dir = join(root, contentDir);
  const files = readdirSync(dir).filter(f => f.startsWith('tool-') && f.endsWith('.md'));
  const toolsMeta = [];
  for (const file of files) {
    const slug = basename(file, '.md').slice(5); // 'tool-dns' → 'dns'
    const source = readFileSync(join(dir, file), 'utf-8');
    const { meta } = parseFrontmatter(source);
    if (!meta.tool_desc) continue;
    toolsMeta.push({
      slug,
      title: meta.title || slug,
      desc: meta.tool_desc,
      suffix: meta.tool_suffix || '',
      order: parseInt(meta.sidebar_order, 10) || 99,
    });
  }
  toolsMeta.sort((a, b) => a.order - b.order);
  const out =
    `// AUTO-GENERATED — run npm run render to update\n` +
    `export const toolsMeta = ${JSON.stringify(toolsMeta, null, 2)};\n`;
  writeFileSync(join(root, outputFile), out, 'utf-8');
  console.log(`Rendered tools-meta: ${toolsMeta.map(t => t.slug).join(', ')}`);
}

function renderDocs(contentDir, outputFile) {
  const dir = join(root, contentDir);
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const rendered = {};
  const docsMeta = {};
  for (const file of files) {
    const key = basename(file, '.md');
    const source = readFileSync(join(dir, file), 'utf-8');
    const { meta, body } = parseFrontmatter(source);
    rendered[key] = renderMarkdown(body);
    docsMeta[key] = meta;
  }
  const out =
    `// AUTO-GENERATED — run npm run render to update\n` +
    `export const rendered = ${JSON.stringify(rendered, null, 2)};\n\n` +
    `export const docsMeta = ${JSON.stringify(docsMeta, null, 2)};\n`;
  writeFileSync(join(root, outputFile), out, 'utf-8');
  console.log(`Rendered ${files.length} docs: ${files.map(f => basename(f, '.md')).join(', ')}`);
}

function renderWrites(contentDir, outputFile) {
  const dir = join(root, contentDir);
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const rendered = {};
  const writesMeta = [];
  for (const file of files) {
    const key = basename(file, '.md');
    const source = readFileSync(join(dir, file), 'utf-8');
    const { meta, body } = parseFrontmatter(source);
    rendered[key] = renderMarkdown(body);
    writesMeta.push({
      id: key,
      title: meta.title || key,
      excerpt: meta.excerpt || '',
      date: meta.date || '',
      readTime: meta.readTime || '',
      tags: meta.tags ? meta.tags.split(',').map(t => t.trim()) : [],
    });
  }
  // Sort newest first (YYYY-MM strings sort lexicographically)
  writesMeta.sort((a, b) => b.date.localeCompare(a.date));
  const out =
    `// AUTO-GENERATED — run npm run render to update\n` +
    `export const rendered = ${JSON.stringify(rendered, null, 2)};\n\n` +
    `export const writesMeta = ${JSON.stringify(writesMeta, null, 2)};\n`;
  writeFileSync(join(root, outputFile), out, 'utf-8');
  console.log(`Rendered ${files.length} writes: ${files.map(f => basename(f, '.md')).join(', ')}`);
}

renderDocs('content/docs',   'public/js/docs-content.js');
renderWrites('content/writes', 'public/js/writes-content.js');
renderToolsMeta('content/docs', 'public/js/tools-meta.js');
