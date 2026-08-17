import { rendered, docsMeta } from './docs-content.js';

// ── Sidebar section display order ────────────────────────────
const SECTION_ORDER = ['Overview', 'Site Guides', 'Technology Tools', 'Technical Reference'];

// ── Build sidebar from frontmatter metadata ──────────────────
function buildSidebar() {
  const sections = {};
  for (const [key, meta] of Object.entries(docsMeta)) {
    const sec = meta.sidebar_section || 'Other';
    (sections[sec] ??= []).push({ key, ...meta });
  }

  const sidebarEl = document.querySelector('.sidebar');
  sidebarEl.replaceChildren();

  const allSections = [
    ...SECTION_ORDER,
    ...Object.keys(sections).filter(s => !SECTION_ORDER.includes(s)),
  ];

  for (const sec of allSections) {
    const entries = sections[sec];
    if (!entries) continue;
    entries.sort((a, b) => Number(a.sidebar_order ?? 99) - Number(b.sidebar_order ?? 99));

    const div = document.createElement('div');
    div.className = 'sidebar-section';

    const p = document.createElement('p');
    p.className = 'sidebar-label';
    p.textContent = sec;
    div.appendChild(p);

    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-link';
      btn.dataset.doc = entry.key;
      btn.textContent = entry.sidebar_label || entry.title;
      div.appendChild(btn);
    }

    sidebarEl.appendChild(div);
  }
}

// ── Render a doc ─────────────────────────────────────────────
function showDoc(key, pushState = true) {
  const doc = docsMeta[key];
  if (!doc) return;

  const breadcrumbEl = document.getElementById('breadcrumb-current');
  if (breadcrumbEl) {
    breadcrumbEl.textContent = doc.breadcrumb;
  }

  const body = document.getElementById('markdown-body');
  if (body) {
    body.innerHTML = DOMPurify.sanitize(rendered[key] ?? '');

    const h1 = body.querySelector('h1');
    if (h1) {
      const meta = document.createElement('div');
      meta.className = 'doc-meta';
      const tag = document.createElement('span');
      tag.className = 'doc-tag';
      tag.textContent = `kapadia.org / ${doc.breadcrumb}`;
      meta.appendChild(tag);
      h1.after(meta);
    }
  }

  const main = document.getElementById('doc-main');
  if (main) {
    main.classList.remove('doc-animate');
    requestAnimationFrame(() => main.classList.add('doc-animate'));
    main.scrollTop = 0;
  }

  document.querySelectorAll('.sidebar-link').forEach(btn => {
    if (btn instanceof HTMLElement) {
      btn.classList.toggle('active', btn.dataset.doc === key);
    }
  });

  document.title = `${doc.title} — Docs — kapadia.org`;
  window.scrollTo({ top: 0 });

  if (pushState) {
    history.pushState({ doc: key }, '', `#${key}`);
  }
}

buildSidebar();

document.querySelector('.sidebar').addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-link');
  if (!btn || !btn.dataset.doc) return;
  const key = btn.dataset.doc;
  showDoc(key);
  if (window.innerWidth <= 768 && typeof closeSidebar === 'function') closeSidebar();
});

window.addEventListener('popstate', e => {
  const key = e.state?.doc || window.location.hash.slice(1) || 'index';
  showDoc(docsMeta[key] ? key : 'index', false);
});

const initKey = window.location.hash.slice(1);
showDoc((initKey && docsMeta[initKey]) ? initKey : 'index', false);

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const toggle = document.getElementById('sidebar-toggle');
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
  } else if (sidebar) {
    sidebar.classList.add('open');
    if (scrim) scrim.classList.add('visible');
    if (toggle) { toggle.classList.add('open'); toggle.setAttribute('aria-expanded', 'true'); }
    document.body.style.overflow = 'hidden';
  }
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const toggle = document.getElementById('sidebar-toggle');
  if (sidebar) sidebar.classList.remove('open');
  if (scrim) scrim.classList.remove('visible');
  if (toggle) { toggle.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  document.body.style.overflow = '';
}

const toggleBtn = document.getElementById('sidebar-toggle');
if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

const scrimBtn = document.getElementById('sidebar-scrim');
if (scrimBtn) scrimBtn.addEventListener('click', closeSidebar);
