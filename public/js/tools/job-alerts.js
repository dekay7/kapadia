document.addEventListener('DOMContentLoaded', () => {

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── Active filter state ───────────────────────────────────────────────────

  const state = { type: 'internship', sector: 'cybersecurity' };

  // ── Query-string feedback banner ─────────────────────────────────────────

  function handleQueryParams() {
    const params = new URLSearchParams(location.search);
    const notice = document.getElementById('ja-notice');
    if (!notice) return;

    if (params.has('verified')) {
      const v = params.get('verified');
      if (v === '1') {
        notice.textContent = 'Email verified. You will receive alerts when new listings are found.';
      } else if (v === 'already') {
        notice.textContent = 'Your email is already verified.';
      } else {
        notice.textContent = 'Verification link is invalid or expired. Try subscribing again.';
      }
      notice.classList.remove('u-hidden');
    } else if (params.has('unsubscribed')) {
      const v = params.get('unsubscribed');
      if (v === '1') {
        notice.textContent = 'You have been unsubscribed.';
      } else {
        notice.textContent = 'Unsubscribe link is invalid.';
      }
      notice.classList.remove('u-hidden');
    }
  }

  // ── Tab switching (job type) ──────────────────────────────────────────────

  function initTypeTabs() {
    const tabs = document.querySelectorAll('.ja-tab[data-type]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('ja-tab--active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('ja-tab--active');
        tab.setAttribute('aria-selected', 'true');
        state.type = tab.dataset.type;
        loadJobs();
      });
    });
  }

  // ── Sector pill switching ─────────────────────────────────────────────────

  function initSectorBtns() {
    const btns = document.querySelectorAll('.ja-sector-btn[data-sector]');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => {
          b.classList.remove('ja-sector-btn--active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('ja-sector-btn--active');
        btn.setAttribute('aria-pressed', 'true');
        state.sector = btn.dataset.sector;
        loadJobs();
      });
    });
  }

  // ── Date formatting ───────────────────────────────────────────────────────

  function formatDate(timestamp) {
    if (!timestamp) return null;
    const d = new Date(timestamp * 1000);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const opts = d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', opts);
  }

  // ── Job loading ──────────────────────────────────────────────────────────

  async function loadJobs() {
    const { type, sector } = state;
    const category = sector === 'cybersecurity' ? 'cybersecurity' : 'it';
    const container = document.getElementById('ja-jobs');
    if (!container) return;

    container.setAttribute('aria-busy', 'true');
    container.replaceChildren();

    const loader = document.createElement('div');
    loader.className = 'ja-loading';
    loader.textContent = 'Loading listings…';
    container.appendChild(loader);

    try {
      const res = await fetch(
        `/api/jobs?category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`
      );
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const jobs = (data.jobs || []).filter(j => j.active);
      renderJobs(container, jobs);
    } catch {
      container.replaceChildren();
      const err = document.createElement('div');
      err.className = 'ja-empty';
      err.textContent = 'Failed to load listings. Please try again.';
      container.appendChild(err);
    } finally {
      container.setAttribute('aria-busy', 'false');
    }
  }

  function renderJobs(container, jobs) {
    container.replaceChildren();

    if (!jobs || jobs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ja-empty';
      empty.textContent = 'No listings found yet. Check back after the next refresh.';
      container.appendChild(empty);
      return;
    }

    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'ja-job-card';

      // Company row
      const company = document.createElement('div');
      company.className = 'ja-job-company';
      company.textContent = job.company;

      // Title / apply link
      const titleEl = document.createElement('a');
      titleEl.className = 'ja-job-title';
      titleEl.textContent = job.title;
      if (job.url) {
        titleEl.href = job.url;
        titleEl.target = '_blank';
        titleEl.rel = 'noopener noreferrer';
      } else {
        titleEl.href = '#';
      }

      // Location + date meta
      const meta = document.createElement('div');
      meta.className = 'ja-job-meta';
      const locs = Array.isArray(job.locations) && job.locations.length
        ? job.locations.slice(0, 2).join(' · ')
        : 'Remote / Multiple';
      const dateStr = formatDate(job.date_posted || job.first_seen);
      meta.textContent = dateStr ? `${dateStr} · ${locs}` : locs;

      card.appendChild(company);
      card.appendChild(titleEl);
      card.appendChild(meta);
      container.appendChild(card);
    });
  }

  // ── Subscribe ────────────────────────────────────────────────────────────

  async function subscribe() {
    const emailInput = document.getElementById('ja-email');
    const statusEl   = document.getElementById('ja-sub-status');
    const btn        = document.getElementById('ja-sub-btn');

    const typeInternBox  = document.getElementById('sub-type-intern');
    const typeNewgradBox = document.getElementById('sub-type-newgrad');
    const sectorCyberBox = document.getElementById('sub-sector-cyber');
    const sectorItBox    = document.getElementById('sub-sector-it');

    if (!emailInput || !statusEl || !btn) return;

    const email = emailInput.value.trim();

    if (!email || !EMAIL_RE.test(email)) {
      statusEl.textContent = 'Enter a valid email address.';
      statusEl.className = 'ja-sub-status error';
      return;
    }

    const wantIntern  = typeInternBox?.checked ?? true;
    const wantNewgrad = typeNewgradBox?.checked ?? true;
    const wantCyber   = sectorCyberBox?.checked ?? true;
    const wantIt      = sectorItBox?.checked ?? true;

    if (!wantIntern && !wantNewgrad) {
      statusEl.textContent = 'Select at least one job type.';
      statusEl.className = 'ja-sub-status error';
      return;
    }
    if (!wantCyber && !wantIt) {
      statusEl.textContent = 'Select at least one sector.';
      statusEl.className = 'ja-sub-status error';
      return;
    }

    // Build all (type × sector) combinations the user wants
    const segments = [];
    if (wantIntern  && wantCyber) segments.push({ listing_type: 'internship', category: 'cybersecurity', label: 'Cybersecurity Internship' });
    if (wantIntern  && wantIt)    segments.push({ listing_type: 'internship', category: 'it',             label: 'IT Internship' });
    if (wantNewgrad && wantCyber) segments.push({ listing_type: 'newgrad',    category: 'cybersecurity', label: 'Cybersecurity New Grad' });
    if (wantNewgrad && wantIt)    segments.push({ listing_type: 'newgrad',    category: 'it',             label: 'IT New Grad' });

    btn.disabled = true;
    statusEl.textContent = 'Sending…';
    statusEl.className = 'ja-sub-status';

    try {
      const responses = await Promise.all(
        segments.map(seg =>
          fetch('/api/jobs/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, category: seg.category, listing_type: seg.listing_type }),
            signal: AbortSignal.timeout(10000),
          })
        )
      );
      const results = await Promise.all(
        responses.map(r => r.json().catch(() => ({ error: `Error ${r.status}` })))
      );

      const anySuccess = responses.some(r => r.ok);
      const allAlready = results.every(r => r.already);

      if (!anySuccess) {
        const msg = results.find(r => r.error)?.error || 'Subscription failed. Please try again.';
        throw new Error(msg);
      }

      if (allAlready) {
        statusEl.textContent = 'Already subscribed. Check your inbox for listings.';
      } else {
        const labels = segments.map(s => s.label).join(', ');
        statusEl.textContent = `Check your inbox — verification link${segments.length > 1 ? 's' : ''} sent for: ${labels}.`;
      }
      statusEl.className = 'ja-sub-status success';
      emailInput.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Subscription failed. Please try again.';
      statusEl.className = 'ja-sub-status error';
    } finally {
      btn.disabled = false;
    }
  }

  function initSubscribeButton() {
    const btn   = document.getElementById('ja-sub-btn');
    const input = document.getElementById('ja-email');
    if (btn)   btn.addEventListener('click', subscribe);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') subscribe(); });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  handleQueryParams();
  initTypeTabs();
  initSectorBtns();
  initSubscribeButton();
  loadJobs();

});
