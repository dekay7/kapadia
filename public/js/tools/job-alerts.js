document.addEventListener('DOMContentLoaded', () => {

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // ── Tab switching ─────────────────────────────────────────────────────────

  function initTabs() {
    const tabs = document.querySelectorAll('.ja-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('ja-tab--active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('ja-tab--active');
        tab.setAttribute('aria-selected', 'true');

        const activeId = tab.dataset.tab;
        document.querySelectorAll('.ja-section').forEach(sec => {
          sec.classList.toggle('ja-section--hidden', sec.id !== `tab-${activeId}`);
        });
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

  async function loadJobs(col) {
    const category = col === 'cyber' ? 'cybersecurity' : 'it';
    const container = document.getElementById(`${col}-jobs`);
    if (!container) return;

    container.setAttribute('aria-busy', 'true');
    container.replaceChildren();

    const loader = document.createElement('div');
    loader.className = 'ja-loading';
    loader.textContent = 'Loading listings…';
    container.appendChild(loader);

    try {
      const [internRes, newgradRes] = await Promise.all([
        fetch(`/api/jobs?category=${encodeURIComponent(category)}&type=internship`),
        fetch(`/api/jobs?category=${encodeURIComponent(category)}&type=newgrad`),
      ]);

      if (!internRes.ok || !newgradRes.ok) throw new Error('API error');

      const [internData, newgradData] = await Promise.all([
        internRes.json(),
        newgradRes.json(),
      ]);

      const internJobs = (internData.jobs || [])
        .filter(j => j.active)
        .map(j => ({ ...j, _type: 'internship' }));

      const newgradJobs = (newgradData.jobs || [])
        .filter(j => j.active)
        .map(j => ({ ...j, _type: 'new grad' }));

      const allJobs = [...internJobs, ...newgradJobs].sort((a, b) => {
        const da = a.date_posted || a.first_seen || 0;
        const db = b.date_posted || b.first_seen || 0;
        return db - da;
      });

      renderJobs(container, allJobs);
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

      // Company row with type badge
      const company = document.createElement('div');
      company.className = 'ja-job-company';
      company.textContent = job.company;

      if (job._type) {
        const badge = document.createElement('span');
        badge.className = 'ja-badge-type';
        badge.textContent = job._type;
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

  async function subscribe(col) {
    const category   = col === 'cyber' ? 'cybersecurity' : 'it';
    const emailInput = document.getElementById(`${col}-email`);
    const statusEl   = document.getElementById(`${col}-sub-status`);
    const btn        = document.getElementById(`${col}-sub-btn`);
    const internBox  = document.getElementById(`${col}-sub-intern`);
    const newgradBox = document.getElementById(`${col}-sub-newgrad`);

    if (!emailInput || !statusEl || !btn) return;

    const email = emailInput.value.trim();

    if (!email || !EMAIL_RE.test(email)) {
      statusEl.textContent = 'Enter a valid email address.';
      statusEl.className = 'ja-sub-status error';
      return;
    }

    const wantIntern  = internBox?.checked ?? true;
    const wantNewgrad = newgradBox?.checked ?? true;

    if (!wantIntern && !wantNewgrad) {
      statusEl.textContent = 'Select at least one listing type.';
      statusEl.className = 'ja-sub-status error';
      return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Sending…';
    statusEl.className = 'ja-sub-status';

    try {
      const postOne = (listing_type) => fetch('/api/jobs/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, category, listing_type }),
        signal: AbortSignal.timeout(10000),
      });

      const promises = [];
      if (wantIntern)  promises.push(postOne('internship'));
      if (wantNewgrad) promises.push(postOne('newgrad'));

      const responses = await Promise.all(promises);
      const results   = await Promise.all(
        responses.map(r => r.json().catch(() => ({ error: `Error ${r.status}` })))
      );

      const anySuccess = responses.some(r => r.ok);
      const allAlready = results.every(r => r.already);

      if (!anySuccess) {
        const msg = results.find(r => r.error)?.error || 'Subscription failed. Please try again.';
        throw new Error(msg);
      }

      statusEl.textContent = allAlready
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
  initTabs();
  initSubscribeButtons();
  loadJobs('cyber');
  loadJobs('it');

});
