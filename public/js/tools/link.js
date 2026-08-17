/**
 * Link Inspector — kapadia.org
 *
 * Security notes:
 *   - All user-derived content set via textContent — never innerHTML
 *   - URL input validated client-side before sending to API
 *   - API response rendered via createElement; no eval or dynamic code execution
 *   - .title attribute used for full URL display (not innerHTML)
 */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const urlInput  = document.getElementById('link-url-input');
  const checkBtn  = document.getElementById('link-check-btn');
  const errorEl   = document.getElementById('link-error');
  const loadingEl = document.getElementById('link-loading');
  const resultsEl = document.getElementById('link-results');

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)            node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('u-hidden');
    loadingEl.classList.add('u-hidden');
    resultsEl.classList.add('u-hidden');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('u-hidden');
  }

  function showLoading() {
    clearError();
    loadingEl.classList.remove('u-hidden');
    resultsEl.classList.add('u-hidden');
  }

  function hideLoading() {
    loadingEl.classList.add('u-hidden');
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

  // ── Score display helpers ─────────────────────────────────────────────────────

  function gradeClass(grade) {
    const map = { A: '', B: 'grade-b', C: 'grade-c', D: 'grade-d', F: 'grade-f' };
    return map[grade] || '';
  }

  function signalBadgeClass(level) {
    const map = {
      critical: 'risk-critical',
      high:     'risk-high',
      medium:   'risk-medium',
      low:      'risk-low',
      info:     'risk-info',
    };
    return map[level] || 'risk-low';
  }

  function statusClass(status) {
    if (status == null) return 'link-hop-status--unknown';
    if (status >= 200 && status < 300) return 'link-hop-status--ok';
    if (status >= 300 && status < 400) return 'link-hop-status--redirect';
    return 'link-hop-status--error';
  }

  // ── Formatting helpers ────────────────────────────────────────────────────────

  function truncateUrl(url, max) {
    max = max || 60;
    return url.length <= max ? url : url.slice(0, max - 1) + '…';
  }

  function formatDays(days) {
    if (days < 1) return '< 1 day';
    if (days === 1) return '1 day';
    if (days < 365) return days + ' days';
    const years = Math.floor(days / 365);
    const rem   = days % 365;
    return rem === 0 ? years + 'yr' : years + 'yr ' + rem + 'd';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().split('T')[0];
  }

  // ── Section title ─────────────────────────────────────────────────────────────

  function sectionTitle(text) {
    return el('p', 'link-section-title', text);
  }

  // ── Info grid row ─────────────────────────────────────────────────────────────

  function infoRow(grid, label, value, cls) {
    grid.appendChild(el('span', 'output-label', label));
    grid.appendChild(el('span', cls || 'output-value', value || '—'));
  }

  // ── Score panel ───────────────────────────────────────────────────────────────

  function renderScore(data) {
    const section = el('div', 'link-score-section');

    const gc = gradeClass(data.grade);
    section.appendChild(el('span', 'link-score-number' + (gc ? ' ' + gc : ''), String(data.score)));
    section.appendChild(el('span', 'link-score-grade', data.grade));

    const info = el('div', 'link-score-info');
    info.appendChild(el('span', 'link-score-verdict', data.verdict));

    const redirectCount = data.hops.filter(h => h.status >= 300 && h.status < 400).length;
    const hopCount      = data.hops.length;
    info.appendChild(el('span', 'link-score-sub',
      hopCount + ' hop' + (hopCount !== 1 ? 's' : '') +
      ' · ' + redirectCount + ' redirect' + (redirectCount !== 1 ? 's' : '')
    ));
    section.appendChild(info);
    return section;
  }

  // ── Security signals ──────────────────────────────────────────────────────────

  function renderSignals(signals) {
    if (!signals || signals.length === 0) return null;
    const wrapper = el('div', 'link-signals');
    wrapper.appendChild(sectionTitle('Security Signals'));

    const block = el('div', 'output-block');
    const list  = el('div', 'link-signal-list');
    for (const sig of signals) {
      const row   = el('div', 'link-signal-row');
      const badge = el('span', 'risk-badge ' + signalBadgeClass(sig.level), sig.level);
      row.appendChild(badge);
      row.appendChild(el('span', 'link-signal-reason', sig.reason));
      if (sig.deduction > 0) {
        row.appendChild(el('span', 'link-signal-deduction', '−' + sig.deduction));
      }
      list.appendChild(row);
    }
    block.appendChild(list);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Redirect chain ────────────────────────────────────────────────────────────

  function renderChain(hops) {
    const wrapper = el('div', 'link-chain-section');
    wrapper.appendChild(sectionTitle('Redirect Chain'));

    const chain = el('div', 'link-chain');
    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];

      if (i > 0) chain.appendChild(el('div', 'link-hop-connector', '↳'));

      const hopEl  = el('div', 'link-hop');
      const urlEl  = el('span', 'link-hop-url', truncateUrl(hop.url));
      urlEl.title  = hop.url;
      hopEl.appendChild(urlEl);

      if (hop.status != null) {
        hopEl.appendChild(el('span', 'link-hop-status ' + statusClass(hop.status), String(hop.status)));
      } else if (hop.unreachable) {
        hopEl.appendChild(el('span', 'link-hop-status link-hop-status--error', 'unreachable'));
      }

      if (hop.domainChanged) {
        hopEl.appendChild(el('span', 'link-hop-marker link-hop-marker--cross', 'domain change'));
      }
      if (hop.downgrade) {
        hopEl.appendChild(el('span', 'link-hop-marker link-hop-marker--danger', 'HTTPS downgrade'));
      }
      if (hop.metaRefresh) {
        hopEl.appendChild(el('span', 'link-hop-marker link-hop-marker--warn', 'meta-refresh'));
      }

      chain.appendChild(hopEl);
    }
    wrapper.appendChild(chain);
    return wrapper;
  }

  // ── Domain intelligence ───────────────────────────────────────────────────────

  function renderDomain(data) {
    if (!data.domain && !data.dns) return null;
    const wrapper = el('div', 'link-domain-section');
    wrapper.appendChild(sectionTitle('Domain Intelligence'));

    const block = el('div', 'output-block');
    const grid  = el('div', 'output-grid link-info-grid');

    if (data.finalBaseDomain) infoRow(grid, 'Domain', data.finalBaseDomain);

    if (data.domain) {
      const d = data.domain;
      infoRow(grid, 'Registrar', d.registrar || '—');
      infoRow(grid, 'Registered', formatDate(d.registered));

      if (d.agedays != null) {
        infoRow(grid, 'Age', formatDays(d.agedays),
          d.agedays < 90 ? 'output-value output-value--warn' : 'output-value');
      }

      infoRow(grid, 'Expires', formatDate(d.expires));

      if (d.expiryDays != null) {
        infoRow(grid, 'Expires in', formatDays(d.expiryDays),
          d.expiryDays < 30 ? 'output-value output-value--warn' : 'output-value output-value--null');
      }

      if (d.status && d.status.length > 0) {
        infoRow(grid, 'RDAP Status', d.status.join(', '));
      }

      if (d.nameservers && d.nameservers.length > 0) {
        infoRow(grid, 'Name servers', d.nameservers.join(', '));
      }
    } else if (data.rdapError) {
      infoRow(grid, 'RDAP', 'No registration record found', 'output-value output-value--warn');
    }

    if (data.dns) {
      if (data.dns.a && data.dns.a.length > 0) {
        infoRow(grid, 'IPv4 (A)', data.dns.a.join(', '));
      }
      if (data.dns.aaaa && data.dns.aaaa.length > 0) {
        infoRow(grid, 'IPv6 (AAAA)', data.dns.aaaa.join(', '));
      }
    }

    if (data.finalTld) {
      infoRow(grid, 'TLD',
        '.' + data.finalTld + (data.suspiciousTld ? ' ⚠' : ''),
        data.suspiciousTld ? 'output-value output-value--warn' : 'output-value');
    }

    block.appendChild(grid);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Response headers ──────────────────────────────────────────────────────────

  function renderHeaders(headers) {
    if (!headers || Object.keys(headers).length === 0) return null;
    const wrapper = el('div', 'link-headers-section');
    wrapper.appendChild(sectionTitle('Response Headers'));

    const block = el('div', 'output-block');
    const grid  = el('div', 'output-grid link-info-grid');

    const security = [
      ['strict-transport-security', 'HSTS'],
      ['x-frame-options',           'X-Frame-Options'],
      ['x-content-type-options',    'X-Content-Type-Options'],
      ['content-security-policy',   'CSP'],
      ['referrer-policy',           'Referrer-Policy'],
      ['permissions-policy',        'Permissions-Policy'],
    ];
    const info = [
      ['server',           'Server'],
      ['x-powered-by',     'X-Powered-By'],
      ['content-type',     'Content-Type'],
      ['via',              'Via'],
      ['cf-cache-status',  'CF-Cache-Status'],
      ['x-xss-protection', 'X-XSS-Protection'],
      ['cache-control',    'Cache-Control'],
    ];

    const positiveKeys = new Set(['strict-transport-security', 'x-content-type-options', 'content-security-policy']);

    for (const [key, label] of security) {
      const val     = headers[key];
      const present = val !== undefined;
      const cls     = present
        ? (positiveKeys.has(key) ? 'output-value output-value--good' : 'output-value')
        : 'output-value output-value--null';
      infoRow(grid, label, present ? (val === '[present]' ? '✓ set' : val) : '—', cls);
    }

    for (const [key, label] of info) {
      const val = headers[key];
      if (val !== undefined) infoRow(grid, label, val);
    }

    block.appendChild(grid);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Privacy notice ────────────────────────────────────────────────────────────

  function renderPrivacy() {
    return el('p', 'link-privacy',
      'Links are fetched by the edge network, not your browser. URLs are not logged or stored.');
  }

  // ── Full results render ───────────────────────────────────────────────────────

  function renderResults(data) {
    resultsEl.replaceChildren();

    resultsEl.appendChild(renderScore(data));

    if (data.signals && data.signals.length > 0) {
      const s = renderSignals(data.signals);
      if (s) resultsEl.appendChild(s);
    }

    if (data.hops && data.hops.length > 0) {
      resultsEl.appendChild(renderChain(data.hops));
    }

    const domainSection = renderDomain(data);
    if (domainSection) resultsEl.appendChild(domainSection);

    const finalHop      = data.hops && data.hops[data.hops.length - 1];
    const headersSection = renderHeaders(finalHop && finalHop.headers);
    if (headersSection) resultsEl.appendChild(headersSection);

    resultsEl.appendChild(renderPrivacy());
    resultsEl.classList.remove('u-hidden');
  }

  // ── Main check ────────────────────────────────────────────────────────────────

  async function runCheck() {
    const url = normalizeUrl(urlInput.value);

    if (!url) {
      showError('Please enter a URL to inspect.');
      return;
    }
    if (!isValidUrl(url)) {
      showError('Please enter a valid URL (e.g. https://example.com).');
      return;
    }

    urlInput.value = url;
    showLoading();
    checkBtn.disabled = true;

    try {
      const res  = await fetch('/api/link?url=' + encodeURIComponent(url));
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'An unexpected error occurred.');
        return;
      }

      hideLoading();
      renderResults(data);
    } catch {
      showError('Failed to reach the server. Please try again.');
    } finally {
      checkBtn.disabled = false;
      hideLoading();
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  checkBtn.addEventListener('click', runCheck);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(); });

})();
