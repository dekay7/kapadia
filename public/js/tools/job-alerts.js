document.addEventListener('DOMContentLoaded', () => {

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const state = {
    cyber: { type: 'internship' },
    it:    { type: 'internship' },
  };

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

  // ── Job loading ──────────────────────────────────────────────────────────

  async function loadJobs(col) {
    const category = col === 'cyber' ? 'cybersecurity' : 'it';
    const type = state[col].type;
    const container = document.getElementById(`${col}-jobs`);
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
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      renderJobs(container, data.jobs);
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
      if (!job.active) {
        const badge = document.createElement('span');
        badge.className = 'ja-badge-closed';
        badge.textContent = 'Closed';
        company.appendChild(badge);
      }

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

      // Location meta
      const meta = document.createElement('div');
      meta.className = 'ja-job-meta';
      const locs = Array.isArray(job.locations) && job.locations.length
        ? job.locations.slice(0, 2).join(' · ')
        : 'Remote / Multiple';
      meta.textContent = locs;

      card.appendChild(company);
      card.appendChild(titleEl);
      card.appendChild(meta);
      container.appendChild(card);
    });
  }

  // ── Toggle buttons ───────────────────────────────────────────────────────

  function initToggles() {
    document.querySelectorAll('.ja-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const col  = btn.dataset.col;
        const type = btn.dataset.type;

        if (state[col].type === type) return;
        state[col].type = type;

        btn.closest('.ja-toggle').querySelectorAll('.ja-toggle-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });

        loadJobs(col);
      });
    });
  }

  // ── Subscribe ────────────────────────────────────────────────────────────

  async function subscribe(col) {
    const category    = col === 'cyber' ? 'cybersecurity' : 'it';
    const listingType = state[col].type;
    const emailInput  = document.getElementById(`${col}-email`);
    const statusEl    = document.getElementById(`${col}-sub-status`);
    const btn         = document.getElementById(`${col}-sub-btn`);

    if (!emailInput || !statusEl || !btn) return;

    const email = emailInput.value.trim();

    if (!email || !EMAIL_RE.test(email)) {
      statusEl.textContent = 'Enter a valid email address.';
      statusEl.className = 'ja-sub-status error';
      return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Sending…';
    statusEl.className = 'ja-sub-status';

    try {
      const res = await fetch('/api/jobs/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, category, listing_type: listingType }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }

      const data = await res.json();
      statusEl.textContent = data.already
        ? 'Already subscribed. Check your inbox for listings.'
        : 'Check your inbox — verification link sent.';
      statusEl.className = 'ja-sub-status success';
      emailInput.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Subscription failed. Please try again.';
      statusEl.className = 'ja-sub-status error';
    } finally {
      btn.disabled = false;
    }
  }

  function initSubscribeButtons() {
    ['cyber', 'it'].forEach(col => {
      const btn = document.getElementById(`${col}-sub-btn`);
      if (btn) btn.addEventListener('click', () => subscribe(col));

      const input = document.getElementById(`${col}-email`);
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') subscribe(col);
        });
      }
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  handleQueryParams();
  initToggles();
  initSubscribeButtons();
  loadJobs('cyber');
  loadJobs('it');

});
