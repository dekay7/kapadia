/**
 * Supply Chain Auditor — kapadia.org
 *
 * Security notes:
 *   - All user-derived content set via textContent — never innerHTML
 *   - URL input validated client-side before sending to API
 *   - API response rendered via createElement; no eval or dynamic code execution
 */

(function () {
  'use strict';

  const API_URL = '/api/chain';

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const urlInput    = document.getElementById('chain-url-input');
  const auditBtn    = document.getElementById('chain-audit-btn');
  const errorEl     = document.getElementById('chain-error');
  const progressEl  = document.getElementById('chain-progress');
  const progressMsg = document.getElementById('chain-progress-msg');
  const resultsEl   = document.getElementById('chain-results');

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)  node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('u-hidden');
    progressEl.classList.add('u-hidden');
    resultsEl.classList.add('u-hidden');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('u-hidden');
  }

  function showProgress(msg) {
    clearError();
    progressMsg.textContent = msg;
    progressEl.classList.remove('u-hidden');
    resultsEl.classList.add('u-hidden');
  }

  function hideProgress() {
    progressEl.classList.add('u-hidden');
  }

  // ── Input normalization ───────────────────────────────────────────────────────

  function normalizeUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
    return trimmed;
  }

  function isValidUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  // ── Risk badge helper ─────────────────────────────────────────────────────────

  function riskBadge(level) {
    const label = level === 'unknown' ? 'unknown' : level;
    const cls = level === 'unknown' ? 'risk-info' : `risk-${level}`;
    return el('span', `risk-badge ${cls}`, label);
  }

  // ── Check/cross symbols ───────────────────────────────────────────────────────

  function matchEl(val) {
    if (val === true)  return el('span', 'chain-match chain-match--ok',   'yes');
    if (val === false) return el('span', 'chain-match chain-match--fail', 'no');
    return el('span', 'chain-match chain-match--na', '—');
  }

  // ── Truncate URL for display ──────────────────────────────────────────────────

  function truncateUrl(url, max) {
    max = max || 55;
    if (url.length <= max) return url;
    return url.slice(0, max - 1) + '…';
  }

  // ── Summary stat cards ────────────────────────────────────────────────────────

  function renderSummary(data) {
    const wrap = el('div', 'chain-stats');

    const stats = [
      { label: 'Resources', value: data.resource_count, cls: '' },
      { label: 'Protected', value: data.resource_count - data.unprotected_count, cls: data.unprotected_count === 0 ? 'chain-stat--good' : '' },
      { label: 'Unprotected', value: data.unprotected_count, cls: data.unprotected_count > 0 ? `risk-${data.overall_risk}` : '' },
      { label: 'Risk Score', value: data.overall_score, cls: `risk-${data.overall_risk}` },
    ];

    for (const s of stats) {
      const card = el('div', 'chain-stat-card');
      const num = el('span', `chain-stat-number${s.cls ? ' ' + s.cls : ''}`, String(s.value));
      const lbl = el('span', 'chain-stat-label', s.label);
      card.appendChild(num);
      card.appendChild(lbl);
      wrap.appendChild(card);
    }

    return wrap;
  }

  // ── Expandable row detail ─────────────────────────────────────────────────────

  function renderRowDetail(resource) {
    const tr = el('tr', 'chain-row-detail');
    const td = document.createElement('td');
    td.colSpan = 6;

    const grid = el('div', 'chain-detail-grid');

    function addRow(label, value) {
      const lbl = el('span', 'chain-detail-label', label);
      const val = el('span', 'chain-detail-value u-mono', value || '—');
      grid.appendChild(lbl);
      grid.appendChild(val);
    }

    addRow('SHA-256', resource.sha256 || '—');
    addRow('SHA-512', resource.sha512 ? resource.sha512.slice(0, 64) + '…' : '—');
    addRow('SRI expected', resource.sri_expected || '—');

    if (resource.npm) {
      const n = resource.npm;
      addRow('npm package', n.pkg ? `${n.pkg}@${n.version}` : '—');
      addRow('npm file', n.file || '—');
      addRow('npm integrity', n.integrity
        ? `${n.integrity.slice(0, 50)}… (${n.integrity_type})`
        : n.error ? `unavailable` : '—');
    }

    if (resource.consensus_match === false) {
      const warn = el('p', 'chain-detail-warn', 'Non-deterministic response: the resource returned different content on two separate fetches. This may indicate active content injection.');
      td.appendChild(warn);
    }

    td.appendChild(grid);
    tr.appendChild(td);
    return tr;
  }

  // ── Results table ─────────────────────────────────────────────────────────────

  function renderTable(resources) {
    const wrap = el('div', 'chain-table-wrap');
    const table = document.createElement('table');
    table.className = 'chain-table';

    // Header
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    const headers = ['Resource', 'SHA-256', 'SRI', 'SRI Match', 'npm', 'Risk'];
    const colClasses = ['', 'chain-col-hash', 'chain-col-sri', 'chain-col-sri-match', 'chain-col-npm', 'chain-col-risk'];
    headers.forEach((h, i) => {
      const th = el('th', colClasses[i], h);
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    resources.forEach(function (resource) {
      // Main row
      const tr = el('tr', 'chain-row-main');
      tr.setAttribute('role', 'button');
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('aria-expanded', 'false');

      // Resource URL cell
      const tdUrl = el('td', 'chain-td-url');
      const urlSpan = el('span', '', truncateUrl(resource.src));
      urlSpan.title = resource.src;
      tdUrl.appendChild(urlSpan);
      tr.appendChild(tdUrl);

      // SHA-256 prefix
      const tdHash = el('td', 'chain-td-hash chain-col-hash');
      tdHash.textContent = resource.sha256 ? resource.sha256.slice(0, 16) + '…' : (resource.error ? 'error' : '—');
      tr.appendChild(tdHash);

      // SRI present
      const tdSri = el('td', 'chain-col-sri');
      tdSri.appendChild(matchEl(resource.sri_present === true ? true : resource.sri_present === false ? false : null));
      tr.appendChild(tdSri);

      // SRI match
      const tdSriMatch = el('td', 'chain-col-sri-match');
      tdSriMatch.appendChild(matchEl(resource.sri_match));
      tr.appendChild(tdSriMatch);

      // npm
      const tdNpm = el('td', 'chain-col-npm');
      if (resource.npm && resource.npm.pkg) {
        const npmLabel = resource.npm.integrity ? (resource.npm.integrity_type === 'file' ? 'matched' : 'tarball') : (resource.npm.error ? 'n/a' : '—');
        const npmCls = resource.npm.integrity && resource.npm.integrity_type === 'file' ? 'chain-match chain-match--ok' : 'chain-match chain-match--na';
        tdNpm.appendChild(el('span', npmCls, npmLabel));
      } else {
        tdNpm.appendChild(el('span', 'chain-match chain-match--na', '—'));
      }
      tr.appendChild(tdNpm);

      // Risk badge
      const tdRisk = el('td', 'chain-col-risk');
      tdRisk.appendChild(riskBadge(resource.risk || 'unknown'));
      tr.appendChild(tdRisk);

      // Expandable detail row
      const detailRow = renderRowDetail(resource);

      function toggleDetail() {
        const open = detailRow.classList.toggle('open');
        tr.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      tr.addEventListener('click', toggleDetail);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDetail(); }
      });

      tbody.appendChild(tr);
      tbody.appendChild(detailRow);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Copy report button ────────────────────────────────────────────────────────

  function renderCopyBtn(data) {
    const wrap = el('div', 'chain-actions');
    const btn = el('button', 'btn chain-copy-btn', 'Copy Report');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy Report'; }, 2000);
      }).catch(function () {
        btn.textContent = 'Copy failed';
        setTimeout(function () { btn.textContent = 'Copy Report'; }, 2000);
      });
    });
    wrap.appendChild(btn);
    return wrap;
  }

  // ── Full results render ───────────────────────────────────────────────────────

  function renderResults(data) {
    resultsEl.replaceChildren();

    // Sensitivity notice
    if (data.has_payment_form || data.has_auth_form) {
      const notice = el('div', 'chain-sensitivity-notice');
      const icon = el('strong', '', data.has_payment_form ? 'Payment form detected.' : 'Login form detected.');
      const desc = el('span', '', ' Compromised scripts on this page could capture sensitive user data.');
      notice.appendChild(icon);
      notice.appendChild(desc);
      resultsEl.appendChild(notice);
    }

    // Truncation notice
    if (data.truncated) {
      const tnotice = el('p', 'u-small u-text-dim chain-truncated-notice', 'Note: page HTML was larger than 128 KB — resources beyond the truncation point were not analyzed.');
      resultsEl.appendChild(tnotice);
    }

    resultsEl.appendChild(renderSummary(data));

    if (data.resources.length === 0) {
      resultsEl.appendChild(el('p', 'u-text-muted u-small', 'No external scripts or stylesheets found on this page.'));
    } else {
      // Overall risk banner
      const overallWrap = el('div', 'chain-overall');
      const overallBadge = riskBadge(data.overall_risk);
      const overallLabel = el('span', 'chain-overall-label', `Overall risk: `);
      overallWrap.appendChild(overallLabel);
      overallWrap.appendChild(overallBadge);
      if (data.overall_risk === 'low') {
        overallWrap.appendChild(el('span', 'u-text-dim u-small', ' — No tampering indicators detected.'));
      }
      resultsEl.appendChild(overallWrap);

      resultsEl.appendChild(renderTable(data.resources));
      resultsEl.appendChild(renderCopyBtn(data));
    }

    // Privacy note
    const privacy = el('p', 'chain-privacy-note u-small u-text-dim', 'Scripts fetched by the edge network, not your browser. No data logged or stored.');
    resultsEl.appendChild(privacy);

    resultsEl.classList.remove('u-hidden');
    requestAnimationFrame(function () { resultsEl.focus(); });
  }

  // ── Progress simulation ───────────────────────────────────────────────────────

  function startProgressSimulation() {
    const stages = [
      [0,     'Fetching page...'],
      [3000,  'Analyzing scripts and stylesheets...'],
      [8000,  'Computing hashes and checking SRI...'],
      [14000, 'Cross-referencing npm registry...'],
    ];
    const timers = [];
    stages.forEach(function (s) {
      timers.push(setTimeout(function () {
        if (!progressEl.classList.contains('u-hidden')) {
          progressMsg.textContent = s[1];
        }
      }, s[0]));
    });
    return function cancel() { timers.forEach(clearTimeout); };
  }

  // ── Main audit function ───────────────────────────────────────────────────────

  async function runAudit() {
    const url = normalizeUrl(urlInput.value);

    if (!url) {
      showError('Please enter a URL to audit.');
      return;
    }
    if (!isValidUrl(url)) {
      showError('Please enter a valid URL (e.g. https://example.com).');
      return;
    }

    urlInput.value = url;
    showProgress('Fetching page...');
    auditBtn.disabled = true;
    auditBtn.setAttribute('aria-busy', 'true');

    const cancelProgress = startProgressSimulation();

    try {
      const res = await fetch(API_URL + '?url=' + encodeURIComponent(url));
      const data = await res.json();

      cancelProgress();

      if (!res.ok) {
        showError(data.error || 'An unexpected error occurred. Please try again.');
        return;
      }

      hideProgress();
      renderResults(data);
    } catch {
      cancelProgress();
      showError('Failed to reach the server. Please check your connection and try again.');
    } finally {
      auditBtn.disabled = false;
      auditBtn.removeAttribute('aria-busy');
      hideProgress();
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  auditBtn.addEventListener('click', runAudit);
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') runAudit();
  });

})();
