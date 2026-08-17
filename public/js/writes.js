import { rendered, writesMeta } from './writes-content.js';

// ── Render list ──────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('writes-list');
  container.replaceChildren();

  writesMeta.forEach(w => {
    const article = document.createElement('article');
    article.className = 'write-item';
    article.dataset.id = w.id;

    const left = document.createElement('div');
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'write-tags';
    w.tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'write-tag';
      span.textContent = t;
      tagsWrap.appendChild(span);
    });

    const titleLink = document.createElement('a');
    titleLink.href = `#${w.id}`;
    titleLink.className = 'write-title-link';
    titleLink.textContent = w.title;

    const h2 = document.createElement('h2');
    h2.className = 'write-title';
    h2.appendChild(titleLink);

    const p = document.createElement('p');
    p.className = 'write-excerpt';
    p.textContent = w.excerpt;

    left.appendChild(tagsWrap);
    left.appendChild(h2);
    left.appendChild(p);

    const right = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'write-meta';
    const dateNode = document.createTextNode(w.date);
    const br = document.createElement('br');
    const readNode = document.createTextNode(`${w.readTime} read`);
    meta.appendChild(dateNode);
    meta.appendChild(br);
    meta.appendChild(readNode);
    const arrow = document.createElement('div');
    arrow.className = 'write-arrow';
    arrow.textContent = '→';
    right.appendChild(meta);
    right.appendChild(arrow);

    article.appendChild(left);
    article.appendChild(right);

    article.addEventListener('click', (e) => {
      e.preventDefault();
      showArticle(w.id);
    });

    container.appendChild(article);
  });
}

// ── Show article ─────────────────────────────────────────────
function showArticle(id, pushState = true) {
  const write = writesMeta.find(w => w.id === id);
  if (!write) return;

  document.getElementById('article-title').textContent = write.title;
  document.getElementById('article-meta').textContent =
    `${write.date}  ·  ${write.readTime} read`;

  const tagsEl = document.getElementById('article-tags');
  tagsEl.replaceChildren();
  write.tags.forEach(t => {
    const s = document.createElement('span');
    s.className = 'article-tag';
    s.textContent = t;
    tagsEl.appendChild(s);
  });

  document.getElementById('article-body').innerHTML = DOMPurify.sanitize(rendered[id] ?? '');

  document.getElementById('list-view').classList.add('hidden');
  document.getElementById('article-view').classList.add('active');

  window.scrollTo({ top: 0 });
  if (pushState) history.pushState({ article: id }, '', `#${id}`);
}

// ── Show list ────────────────────────────────────────────────
function showList(pushState = true) {
  document.getElementById('article-view').classList.remove('active');
  document.getElementById('list-view').classList.remove('hidden');
  window.scrollTo({ top: 0 });
  if (pushState) history.pushState({}, '', '/writes/');
}

// ── Wire back button ─────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', showList);

// ── Handle back/forward ──────────────────────────────────────
window.addEventListener('popstate', () => {
  const hash = window.location.hash.slice(1);
  if (hash) showArticle(hash, false);
  else showList(false);
});

// ── Init ─────────────────────────────────────────────────────
renderList();

const hash = window.location.hash.slice(1);
if (hash) showArticle(hash);
