// ── Terminal animation ───────────────────────────────────────
const termBody = document.getElementById('term-body');

// ── Command allowlist ────────────────────────────────────────
const COMMANDS = Object.freeze({
  'tools':        '/tools/',
  'docs':         '/docs/',
  'writes':       '/writes/',
  'about':        '/about/',
  'tools/dns':    '/tools/dns/',
  'tools/encode': '/tools/encode/',
  'tools/exif':   '/tools/exif/',
  'tools/hash':   '/tools/hash/',
  'tools/jwt':    '/tools/jwt/',
  'tools/leak':   '/tools/leak/',
  'tools/email':  '/tools/email/',
  'tools/link':   '/tools/link/',
  'tools/osint':  '/tools/osint/',
  'tools/speed':  '/tools/speed/',
  'tools/subnet': '/tools/subnet/',
  'about/cv':     '/about/cv/',
  'privacy':      '/privacy/',
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

// Returns true to open a new input row, false to stop (navigating away or clear).
function executeCommand(raw, anchor) {
  if (!raw) return true;

  const cmd = raw.toLowerCase().replace(/\/$/, '');
  const dest = COMMANDS[cmd];

  if (dest) {
    window.location.href = dest;
    return false;
  }

  const out = document.createElement('div');
  out.className = 'term-line data visible';
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
  hidden.setAttribute('tabindex', '-1');
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
  let { typed, cur, ghost } = newRow(true);

  // Tab-cycling state — reset whenever the user types
  let tabCycling = false;
  let tabMatches = [];
  let tabIndex = -1;

  function resetTabCycle() {
    tabCycling = false;
    tabMatches = [];
    tabIndex = -1;
  }

  function cycleTab(dir = 1) {
    if (!tabCycling || tabMatches.length === 0) {
      const val = hidden.value;
      const matches = CMD_KEYS.filter(k => k.startsWith(val)).sort();
      if (matches.length === 0) return;
      tabMatches = matches;
      tabIndex = dir === 1 ? 0 : matches.length - 1;
      tabCycling = true;
    } else {
      tabIndex = (tabIndex + dir + tabMatches.length) % tabMatches.length;
    }
    const chosen = tabMatches[tabIndex];
    hidden.value = sanitizeInput(chosen + '/');
    typed.textContent = hidden.value;
    ghost.textContent = getCompletion(chosen + '/');
  }

  hidden.addEventListener('input', () => {
    if (animating) { hidden.value = ''; return; }
    const safe = sanitizeInput(hidden.value);
    hidden.value = safe;
    typed.textContent = safe;
    ghost.textContent = getCompletion(safe);
    resetTabCycle();
  });

  hidden.addEventListener('keydown', (e) => {
    if (animating) { e.preventDefault(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = hidden.value.trim();

      // Freeze the current row: drop cursor, lock in the trimmed text
      cur.remove();
      typed.textContent = raw;
      ghost.textContent = '';
      hidden.value = '';
      resetTabCycle();

      const cont = executeCommand(raw, anchor);

      if (cont !== false) {
        ({ typed, cur, ghost } = newRow());
      }

      requestAnimationFrame(scrollRowIntoView);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    }
  });

  // Closures capture the let-binding, so they always act on the active cursor
  hidden.addEventListener('focus', () => { cur.style.display = ''; });
  hidden.addEventListener('blur',  () => { cur.style.display = 'none'; });

  // Desktop: grab focus immediately after animation without scrolling the page
  if (!isMobile()) hidden.focus({ preventScroll: true });

  // Snap the hidden input to the active row's document position so iOS scrolls
  // to show the terminal just above the keyboard, then focus.
  function focusAtRow() {
    const row = cur.closest('.term-input-row');
    if (row) {
      const rect = row.getBoundingClientRect();
      hidden.style.top  = (rect.top  + window.scrollY) + 'px';
      hidden.style.left = (rect.left + window.scrollX) + 'px';
    }
    hidden.focus();
  }

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
  }

  // When the keyboard opens/closes, visualViewport resizes. Scroll then so the
  // active row lands just above the keyboard (iOS doesn't account for the keyboard
  // when scrolling to the focused hidden input).
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (document.activeElement === hidden) scrollRowIntoView();
    });
  }

  // Mobile: tap anywhere in the terminal that isn't a navigation link → focus input
  const termEl = document.getElementById('terminal');
  termEl.addEventListener('click', (e) => {
    if (!e.target.closest('a')) focusAtRow();
  });

  // Mobile swipe-right to complete (Tab equivalent for touchscreens)
  let swipeStartX = 0, swipeStartY = 0;
  termEl.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  termEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) cycleTab(dx > 0 ? 1 : -1);
  }, { passive: true });
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
