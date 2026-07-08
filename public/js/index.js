import { toolsMeta } from '/js/tools-meta.js';

// ── Terminal animation ───────────────────────────────────────
const termBody = document.getElementById('term-body');

// ── Command allowlist ────────────────────────────────────────
const COMMANDS = Object.freeze({
  'tools':    '/tools/',
  'docs':     '/docs/',
  'writes':   '/writes/',
  'about':    '/about/',
  ...Object.fromEntries(toolsMeta.map(t => [`tools/${t.slug}`, `/tools/${t.slug}/`])),
  'about/cv': '/about/cv/',
  'privacy':  '/privacy/',
});
const CMD_KEYS = Object.keys(COMMANDS);

function getCompletion(val) {
  if (!val) return '';
  if (CMD_KEYS.includes(val)) return '/';
  const match = CMD_KEYS.find(k => k.startsWith(val) && k !== val);
  if (!match) return '';
  const suffix = match.slice(val.length);
  return CMD_KEYS.includes(val + suffix) ? suffix + '/' : suffix;
}

function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches;
}

// Strip non-printable chars and enforce max length — applied before any display
function sanitizeInput(str) {
  return str.replace(/[^\x20-\x7E]/g, '').slice(0, 60);
}

function pad(str, len) {
  return String(str).padEnd(len, ' ');
}

// Longest string that all entries in arr start with
function commonPrefix(arr) {
  if (!arr.length) return '';
  let prefix = arr[0];
  for (let i = 1; i < arr.length; i++) {
    while (!arr[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function makeLine(text, cls, insertBefore = null) {
  const el = document.createElement('div');
  el.className = 'term-line' + (cls ? ' ' + cls : '');

  if (cls === 'nav' && text.includes(' → ')) {
    // text: '  → /tools    security & network tools'
    const match = text.match(/(  → )(\/[a-z/]+\/)(\s+.*)/);
    if (match) {
      const [_, arrow, path, desc] = match;
      el.textContent = arrow;

      const link = document.createElement('a');
      link.href = path;
      link.textContent = path;
      link.className = 'term-nav-link';
      el.appendChild(link);

      const descSpan = document.createElement('span');
      descSpan.textContent = desc;
      el.appendChild(descSpan);
    } else {
      el.textContent = text;
    }
  } else {
    el.textContent = text || ' ';
  }

  if (!text) el.classList.add('empty');

  if (insertBefore !== false) {
    if (insertBefore) {
      termBody.insertBefore(el, insertBefore);
    } else {
      termBody.appendChild(el);
    }
  }
  return el;
}

function showLine(el, delay, insertBefore = null) {
  return new Promise(resolve =>
    setTimeout(() => {
      if (insertBefore) termBody.insertBefore(el, insertBefore);
      el.offsetHeight; // force reflow so the CSS transition fires
      el.classList.add('visible');
      resolve();
    }, delay)
  );
}

async function safeFetch(url, ms = 4000) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok ? await res.json() : null;
  } catch (_) { return null; }
}

async function runTerminal({ ipv4, ipv6, geo }) {
  const loc = [geo?.city, geo?.region, geo?.country].filter(Boolean).join(', ') || '—';
  const tz = geo?.timezone || '—';
  const asn = geo?.asOrganization || null;

  // Show whichever IP version(s) are available.
  // /api/info classifies CF-Connecting-IP server-side:
  //   IPv4 connection → ipv4 field is set, ipv6 is null
  //   IPv6 connection → ipv6 field is set, ipv4 is null
  const ipLines = [];
  if (ipv4) ipLines.push({ t: pad('visitor.ipv4', 20) + ipv4, cls: 'data' });
  if (ipv6) ipLines.push({ t: pad('visitor.ipv6', 20) + ipv6, cls: 'data' });
  if (!ipv4 && !ipv6) ipLines.push({ t: pad('visitor.ip', 20) + '—', cls: 'data' });

  let t = 0;
  const tick = (dt) => { t += dt; return t; };

  const specs = [
    { t: '$ connecting to kapadia.org...', cls: 'cmd', d: tick(0) },
    { t: '', cls: 'empty', d: tick(80) },
    ...ipLines.map(l => ({ ...l, d: tick(70) })),
    { t: pad('visitor.location', 20) + loc, cls: 'data', d: tick(60) },
    { t: pad('visitor.timezone', 20) + tz, cls: 'data', d: tick(50) },
    ...(asn ? [{ t: pad('visitor.network', 20) + asn, cls: 'data', d: tick(50) }] : []),
    { t: '', cls: 'empty', d: tick(50) },
    { t: '─'.repeat(25), cls: 'divider', d: tick(30) },
    { t: '', cls: 'empty', d: tick(25) },
    { t: '  → /tools/    security & network tools', cls: 'nav', d: tick(50) },
    { t: '  → /docs/     technical documentation', cls: 'nav', d: tick(50) },
    { t: '  → /writes/   essays & write-ups', cls: 'nav', d: tick(50) },
    { t: '  → /about/    philosophy & background', cls: 'nav', d: tick(50) },
    { t: '', cls: 'empty', d: tick(50) },
  ];

  const cursorEl = document.createElement('span');
  cursorEl.className = 'cursor';
  cursorEl.style.animation = 'none';
  termBody.appendChild(cursorEl);

  const elements = specs.map(s => ({ el: makeLine(s.t, s.cls, false), d: s.d }));

  await Promise.all(elements.map(({ el, d }) => showLine(el, d, cursorEl)));
  cursorEl.style.animation = '';
  return cursorEl;
}

// Returns true to open a new input row, false to stop (navigating away).
// Normalizes leading slashes so /tools/speed works identically to tools/speed.
function executeCommand(raw, anchor) {
  if (!raw) return true;

  const cmd = raw.toLowerCase().replace(/^\/+/, '').replace(/\/$/, '');
  const dest = COMMANDS[cmd];

  if (dest) {
    window.location.href = dest;
    return false;
  }

  const out = document.createElement('div');
  out.className = 'term-line err visible';
  out.textContent = `bash: cd: ${sanitizeInput(raw)}: No such file or directory`;
  termBody.insertBefore(out, anchor);
  return true;
}

function initInput(staticCursor) {
  staticCursor.remove();

  // Hidden <input> captures keystrokes without rendering on screen.
  // Appended to <body> so position:absolute coords are in document space,
  // letting iOS scroll to the active input row before the keyboard appears.
  const hidden = document.createElement('input');
  hidden.type = 'text';
  hidden.className = 'term-hidden-input';
  hidden.setAttribute('autocomplete', 'off');
  hidden.setAttribute('autocorrect', 'off');
  hidden.setAttribute('autocapitalize', 'off');
  hidden.setAttribute('spellcheck', 'false');
  hidden.setAttribute('maxlength', '60');
  // Desktop keeps the input out of the tab order. On mobile it must stay
  // navigable so the keyboard's ▲/▼ form-navigator can locate it between the
  // two sentinel inputs created below.
  if (!isMobile()) hidden.setAttribute('tabindex', '-1');
  hidden.setAttribute('aria-label', 'Terminal command input');
  document.body.appendChild(hidden);

  // Anchor keeps the insertBefore reference inside termBody now that hidden
  // lives on <body>.
  const anchor = document.createElement('span');
  termBody.appendChild(anchor);

  const PROMPT_TEXT = '$ cd ~/';
  const PROMPT_ANIMATE = 'cd ~/';

  function newRow(animate = false) {
    const row = document.createElement('div');
    row.className = 'term-line term-input-row visible';

    const prompt = document.createElement('span');
    prompt.className = 'term-input-prompt';

    const typed = document.createElement('span');
    typed.className = 'term-input-typed';

    const cur = document.createElement('span');
    cur.className = 'cursor';

    const ghost = document.createElement('span');
    ghost.className = 'term-input-ghost';

    row.append(prompt, typed, cur, ghost);
    termBody.insertBefore(row, anchor);

    if (animate) {
      prompt.textContent = '$ ';
      let i = 0;
      cur.style.display = 'none';
      animating = true;
      function typeNext() {
        prompt.textContent = '$ ' + PROMPT_ANIMATE.slice(0, ++i);
        if (i >= PROMPT_ANIMATE.length) {
          animating = false;
          hidden.value = '';
          cur.style.display = document.activeElement === hidden ? '' : 'none';
        } else {
          setTimeout(typeNext, 60 + Math.random() * 40);
        }
      }
      setTimeout(typeNext, 60 + Math.random() * 40);
    } else {
      prompt.textContent = PROMPT_TEXT;
    }

    return { typed, cur, ghost };
  }

  // let-bindings so focus/blur/input closures always reference the active row
  let animating = false;
  // Menu-completion state for the mobile keyboard's ▲/▼ form-navigator.
  let cycleMatches = null;
  let cycleIndex = -1;
  let navSentinels = [];
  let { typed, cur, ghost } = newRow(true);

  // Print all Tab matches as a terminal output line (bash double-Tab style).
  // Freezes the current prompt row, prints the match list, then opens a fresh
  // row with the same content so the user can keep typing.
  function showTabCompletions(matches) {
    cur.remove();

    const line = document.createElement('div');
    line.className = 'term-line data visible';
    line.textContent = matches.map(m => m + '/').join('    ');
    termBody.insertBefore(line, anchor);

    const savedVal = hidden.value;
    ({ typed, cur, ghost } = newRow());
    hidden.value = savedVal;
    typed.textContent = savedVal;
    ghost.textContent = getCompletion(savedVal);

    requestAnimationFrame(scrollRowIntoView);
  }

  // Tab: fill to longest common prefix on first press; show all matches if
  // already at the prefix (mirrors bash completion behaviour).
  function handleTab() {
    if (animating) return;
    cycleMatches = null;
    const val = hidden.value;
    const matches = CMD_KEYS.filter(k => k.startsWith(val) && !k.slice(val.length).includes('/')).sort();

    if (matches.length === 0) return;

    if (matches.length === 1) {
      const completed = sanitizeInput(matches[0] + '/');
      hidden.value = completed;
      typed.textContent = completed;
      ghost.textContent = '';
      return;
    }

    const prefix = commonPrefix(matches);
    if (prefix.length > val.length) {
      const completed = CMD_KEYS.includes(prefix) ? prefix + '/' : prefix;
      hidden.value = completed;
      typed.textContent = completed;
      ghost.textContent = getCompletion(completed);
      return;
    }

    // Already at common prefix — show the full match list
    showTabCompletions(matches);
  }

  hidden.addEventListener('input', () => {
    if (animating) { hidden.value = ''; return; }
    cycleMatches = null; // typing invalidates the ▲/▼ completion cycle
    const safe = sanitizeInput(hidden.value);
    hidden.value = safe;
    typed.textContent = safe;
    ghost.textContent = getCompletion(safe);
  });

  hidden.addEventListener('keydown', (e) => {
    if (animating) { e.preventDefault(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      cycleMatches = null;
      const raw = hidden.value.trim();

      // Freeze the current row: drop cursor, lock in the trimmed text
      cur.remove();
      typed.textContent = raw;
      ghost.textContent = '';
      hidden.value = '';

      const cont = executeCommand(raw, anchor);

      if (cont !== false) {
        ({ typed, cur, ghost } = newRow());
      }

      requestAnimationFrame(scrollRowIntoView);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTab();
    }
  });

  // Closures capture the let-binding, so they always act on the active cursor
  hidden.addEventListener('focus', () => { cur.style.display = ''; syncHiddenPos(); });
  hidden.addEventListener('blur',  () => { cur.style.display = 'none'; });

  // Desktop: grab focus immediately after animation without scrolling the page
  if (!isMobile()) hidden.focus({ preventScroll: true });

  // Shared scroll helper — brings the active input row just above the keyboard.
  // visH is window.visualViewport.height (already excludes keyboard) or innerHeight.
  function scrollRowIntoView() {
    const row = cur.closest('.term-input-row');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const vv = window.visualViewport;
    const visH = vv ? vv.height : window.innerHeight;
    if (rect.bottom > visH - 8) {
      window.scrollBy({ top: rect.bottom - visH + 8, behavior: 'instant' });
    }
    syncHiddenPos();
  }

  // Keeps the hidden input's document-absolute position in sync with the
  // active input row so iOS scrolls to the right place when the keyboard opens.
  function syncHiddenPos() {
    const row = cur.closest('.term-input-row');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const top  = (rect.top  + window.scrollY) + 'px';
    const left = (rect.left + window.scrollX) + 'px';
    hidden.style.top  = top;
    hidden.style.left = left;
    // Pin the ▲/▼ sentinels to the same spot so focusing them (which iOS
    // scrolls into view) never jumps the page away from the active row.
    for (const s of navSentinels) { s.style.top = top; s.style.left = left; }
  }

  // Tapping anywhere in the terminal focuses the hidden input (mobile + desktop).
  document.getElementById('terminal').addEventListener('click', () => {
    hidden.focus();
    scrollRowIntoView();
  });

  // ── Mobile form-navigator (keyboard ▲/▼) menu-completion ────────────────────
  // The soft-keyboard's previous/next arrows only surface when the page has
  // several focusable form fields, and they navigate by moving focus between
  // fields — they never dispatch a key event. We flank the real input with two
  // zero-size sentinel inputs: focusing one is our signal to step backward
  // (prev/▲) or forward (next/▼) through the matching commands (same match set
  // as Tab), autofill the result, then immediately return focus to the real
  // input so typing continues uninterrupted and the arrows stay available.
  function cycleCompletion(direction) {
    if (animating) return;
    if (cycleMatches === null) {
      const base = hidden.value;
      cycleMatches = CMD_KEYS
        .filter(k => k.startsWith(base) && !k.slice(base.length).includes('/'))
        .sort();
      cycleIndex = -1;
    }
    if (cycleMatches.length === 0) { cycleMatches = null; return; }
    cycleIndex = cycleIndex === -1
      ? (direction === 1 ? 0 : cycleMatches.length - 1)
      : (cycleIndex + direction + cycleMatches.length) % cycleMatches.length;
    const completed = sanitizeInput(cycleMatches[cycleIndex] + '/');
    hidden.value = completed;
    typed.textContent = completed;
    ghost.textContent = '';
  }

  if (isMobile()) {
    const makeSentinel = (label) => {
      const s = document.createElement('input');
      s.type = 'text';
      s.className = 'term-hidden-input';
      s.setAttribute('autocomplete', 'off');
      s.setAttribute('autocorrect', 'off');
      s.setAttribute('autocapitalize', 'off');
      s.setAttribute('spellcheck', 'false');
      s.setAttribute('aria-label', label);
      return s;
    };
    const prevNav = makeSentinel('Previous navigation option');
    const nextNav = makeSentinel('Next navigation option');
    // DOM order (prevNav → hidden → nextNav) defines the ▲/▼ traversal order.
    hidden.insertAdjacentElement('beforebegin', prevNav);
    hidden.insertAdjacentElement('afterend', nextNav);
    navSentinels = [prevNav, nextNav];
    syncHiddenPos();

    // Return focus after the browser settles the focus change, so the keyboard
    // (already open) stays up and the accessory arrows recompute around hidden.
    const returnFocus = () => setTimeout(() => hidden.focus({ preventScroll: true }), 0);
    prevNav.addEventListener('focus', () => { cycleCompletion(-1); returnFocus(); });
    nextNav.addEventListener('focus', () => { cycleCompletion(1);  returnFocus(); });
  }
}

async function init() {
  // Single fetch to /api/info — The edge network reads the connecting IP
  // and classifies it server-side as ipv4 or ipv6. No external APIs needed.
  //
  // Why not use two subdomains to get both IPs simultaneously?
  // The edge proxy is dual-stack: every proxied record (A or AAAA)
  // gets both IPv4 and IPv6 anycast addresses. The browser's Happy Eyeballs
  // algorithm then picks IPv6 for both, returning the same address twice.
  // The split-subdomain trick requires a non-proxied, IPv4-only origin.
  const geo = await safeFetch('/api/info');

  const cursorEl = await runTerminal({
    ipv4: geo?.ipv4 || null,
    ipv6: geo?.ipv6 || null,
    geo,
  });

  initInput(cursorEl);
}

init();

// When the browser restores this page from the bfcache (back button), the
// frozen DOM shows the last "navigating to..." state. Re-init to reset it.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    termBody.replaceChildren();
    init();
  }
});
