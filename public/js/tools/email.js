/**
 * Email Analyzer — kapadia.org
 *
 * Security notes:
 *   - All parsed values rendered via textContent — never innerHTML
 *   - Input capped at 1 MB before processing
 *   - No outbound network requests; 100% client-side
 *   - OSINT link for originating IP is user-triggered navigation, not auto-fetch
 */

(function () {
  'use strict';

  const MAX_BYTES = 1 * 1024 * 1024;

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const inputEl   = document.getElementById('email-input');
  const analyzeBtn = document.getElementById('email-analyze-btn');
  const errorEl   = document.getElementById('email-error');
  const resultsEl = document.getElementById('email-results');

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)             node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('u-hidden');
    resultsEl.classList.add('u-hidden');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('u-hidden');
  }

  function sectionTitle(text) {
    return el('p', 'link-section-title', text);
  }

  function sectionHeader(title, subtitle) {
    const wrapper = el('div', 'email-section-header');
    wrapper.appendChild(el('p', 'link-section-title email-section-title-compact', title));
    if (subtitle) wrapper.appendChild(el('p', 'email-section-subtitle', subtitle));
    return wrapper;
  }

  // ── OSINT result helpers (mirrors osint.js section/grid/row/tag) ──────────────

  function osintSection(title) {
    const wrap = el('div', 'osint-section');
    wrap.appendChild(el('h3', 'osint-section-title', title));
    return wrap;
  }

  function osintGrid() {
    const block = el('div', 'output-block');
    block.appendChild(el('div', 'output-grid'));
    return block;
  }

  function osintRow(blockEl, label, valueEl) {
    const g = blockEl.querySelector('.output-grid') || blockEl;
    g.appendChild(el('span', 'output-label osint-label', label));
    g.appendChild(valueEl);
  }

  function osintTag(value, type) {
    return el('span', 'output-value osint-val-' + (type || 'data'), value);
  }

  // ── Header parsing ────────────────────────────────────────────────────────────

  function parseRawHeaders(raw) {
    if (raw.length > MAX_BYTES) throw new Error('Input exceeds 1 MB limit.');

    // If the full email was pasted, take only the headers block (before the first blank line)
    const headersOnly = raw.split(/\r?\n\r?\n/)[0];

    // Unfold RFC 5322 continuation lines (lines starting with whitespace)
    const unfolded = headersOnly.replace(/\r?\n([ \t]+)/g, ' ');
    const lines = unfolded.split(/\r?\n/);

    const headers = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const name = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (/^[a-z0-9-]+$/.test(name)) {
        headers.push({ name, value });
      }
    }
    return headers;
  }

  function getAll(headers, name) {
    return headers.filter(h => h.name === name).map(h => h.value);
  }

  function getFirst(headers, name) {
    const h = headers.find(h => h.name === name);
    return h ? h.value : null;
  }

  // ── Address helpers ───────────────────────────────────────────────────────────

  function extractEmail(value) {
    if (!value) return null;
    const angleMatch = value.match(/<([^>]+)>/);
    if (angleMatch) return angleMatch[1].trim().toLowerCase();
    const trimmed = value.trim();
    return trimmed.includes('@') ? trimmed.toLowerCase() : null;
  }

  function extractDomain(value) {
    const email = extractEmail(value);
    if (!email) return null;
    const at = email.lastIndexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
  }

  // Returns the organizational domain, matching DMARC relaxed alignment.
  // e.g. mail9.glassdoor.com → glassdoor.com, mail.bbc.co.uk → bbc.co.uk
  const TWO_LEVEL_TLDS = new Set([
    'co.uk', 'com.au', 'co.jp', 'co.nz', 'org.uk', 'me.uk',
    'net.au', 'com.br', 'co.in', 'co.za', 'co.kr', 'com.mx',
  ]);

  function orgDomain(domain) {
    if (!domain) return null;
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    const last2 = parts.slice(-2).join('.');
    return TWO_LEVEL_TLDS.has(last2) ? parts.slice(-3).join('.') : last2;
  }

  // ── Authentication-Results parser ─────────────────────────────────────────────

  function parseAuthResults(values) {
    const combined = values.join('; ');
    const verdicts = { spf: null, dkim: null, dmarc: null };

    const re = /(dkim|spf|dmarc)=(pass|fail|neutral|softfail|none|permerror|temperror)/gi;
    let m;
    while ((m = re.exec(combined)) !== null) {
      const key = m[1].toLowerCase();
      if (verdicts[key] === null) verdicts[key] = m[2].toLowerCase();
    }

    const dkimDomain =
      combined.match(/header\.i=@?([a-z0-9._-]+)/i)?.[1]?.toLowerCase() ||
      combined.match(/header\.d=([a-z0-9._-]+)/i)?.[1]?.toLowerCase() ||
      null;

    return {
      verdicts,
      dkimDomain,
      dkimSelector:  combined.match(/header\.s=([a-z0-9._-]+)/i)?.[1] || null,
      dkimAlg:       combined.match(/header\.a=([a-z0-9-]+)/i)?.[1] || null,
      spfMailfrom:   combined.match(/smtp\.mailfrom=([a-z0-9@._+%-]+)/i)?.[1] || null,
      dmarcPolicy:   combined.match(/dmarc=[^;(]*\(p=([A-Z]+)/i)?.[1]?.toLowerCase() || null,
    };
  }

  // ── DKIM-Signature fallback (when AR doesn't include domain detail) ───────────

  function parseDkimSignature(value) {
    if (!value) return null;
    return {
      d: value.match(/\bd=([a-z0-9._-]+)/i)?.[1]?.toLowerCase() || null,
      s: value.match(/\bs=([a-z0-9._-]+)/i)?.[1] || null,
      a: value.match(/\ba=([a-z0-9-]+)/i)?.[1] || null,
    };
  }

  // ── Received header parser ────────────────────────────────────────────────────

  function parseReceived(value) {
    const ipv4Match = value.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
    const ipv6Match = value.match(/\[IPv6:([0-9a-f:]+)\]/i);
    const ip = ipv4Match ? ipv4Match[1] : (ipv6Match ? ipv6Match[1] : null);

    const fromMatch = value.match(/^from\s+(\S+)/i);
    const byMatch   = value.match(/\bby\s+(\S+)/i);
    const withMatch = value.match(/\bwith\s+(\S+)/i);

    const fromHost = fromMatch ? fromMatch[1].replace(/[();]/g, '') : null;
    const byHost   = byMatch   ? byMatch[1].replace(/[();]/g, '')   : null;
    const protocol = withMatch ? withMatch[1].toUpperCase()          : null;
    const usedTls  = protocol ? /ESMTPS|SMTPS|STARTTLS/.test(protocol) : false;

    // Timestamp follows the last semicolon
    const parts = value.split(';');
    const tsStr = parts.length > 1 ? parts[parts.length - 1].trim() : null;
    const ts    = tsStr ? new Date(tsStr) : null;

    return {
      ip,
      fromHost,
      byHost,
      protocol,
      usedTls,
      timestamp: ts && !isNaN(ts.getTime()) ? ts : null,
    };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────

  function computeScore(headers) {
    const signals = [];

    // Gather auth data
    const arValues   = getAll(headers, 'authentication-results');
    const auth       = arValues.length > 0 ? parseAuthResults(arValues) : null;

    // Fill in DKIM domain from DKIM-Signature header if AR didn't provide it
    const dkimSigRaw = getFirst(headers, 'dkim-signature');
    const dkimSig    = dkimSigRaw ? parseDkimSignature(dkimSigRaw) : null;
    const dkimDomain = auth?.dkimDomain || dkimSig?.d || null;
    const dkimSelector = auth?.dkimSelector || dkimSig?.s || null;
    const dkimAlg      = auth?.dkimAlg    || dkimSig?.a || null;

    // Address fields
    const fromDomain       = extractDomain(getFirst(headers, 'from'));
    const returnPathDomain = extractDomain(getFirst(headers, 'return-path'));
    const replyToDomain    = extractDomain(getFirst(headers, 'reply-to'));
    const msgIdDomain      = (getFirst(headers, 'message-id') || '')
                               .match(/@([a-z0-9._-]+)>/i)?.[1]?.toLowerCase() || null;

    // Received chain — raw headers are newest-first, so reverse for chronological order
    const receivedVals  = getAll(headers, 'received');
    const hopsOrdered   = receivedVals.map(v => parseReceived(v)).reverse();

    // ── Authentication deductions ─────────────────────────────────────────────
    const hasAnyAuth = auth && Object.values(auth.verdicts).some(v => v !== null);

    if (!hasAnyAuth) {
      signals.push({ level: 'high', reason: 'No security checks found — try pasting more of the email source', deduction: 15, category: 'auth' });
    } else {
      const { spf, dkim, dmarc } = auth.verdicts;

      if (dmarc === 'fail') {
        signals.push({ level: 'critical', reason: "DMARC failed — the sender's domain policy rejected this email", deduction: 25, category: 'auth' });
      } else if (dmarc === null) {
        signals.push({ level: 'high', reason: 'DMARC missing — no domain policy check was recorded', deduction: 15, category: 'auth' });
      } else if (dmarc === 'pass' && auth.dmarcPolicy === 'none') {
        signals.push({ level: 'info', reason: 'DMARC policy is "none" — the domain monitors but does not block spoofed mail yet', deduction: 0, category: 'auth' });
      }

      if (dkim === 'fail') {
        signals.push({ level: 'critical', reason: "DKIM failed — the email's signature is invalid or the message may have been tampered with", deduction: 20, category: 'auth' });
      } else if (dkim === null) {
        signals.push({ level: 'medium', reason: 'DKIM missing — no email signature check was recorded', deduction: 10, category: 'auth' });
      }

      if (spf === 'fail') {
        signals.push({ level: 'high', reason: 'SPF failed — the sending server is not authorized to send for this domain', deduction: 15, category: 'auth' });
      } else if (spf === 'softfail') {
        signals.push({ level: 'medium', reason: "SPF softfail — the sender is not fully authorized by the domain's policy", deduction: 8, category: 'auth' });
      } else if (spf === null) {
        signals.push({ level: 'low', reason: 'SPF missing — no sender authorization check was recorded', deduction: 5, category: 'auth' });
      }
    }

    // ── Identity consistency deductions ───────────────────────────────────────
    // Comparisons use organizational domain (last two labels) so that legitimate
    // subdomains like mail9.glassdoor.com are not flagged against glassdoor.com.
    if (fromDomain && dkimDomain && orgDomain(fromDomain) !== orgDomain(dkimDomain)) {
      signals.push({ level: 'high', reason: `Sender mismatch — displayed domain (${fromDomain}) ≠ signing domain (${dkimDomain})`, deduction: 15, category: 'identity' });
    }

    if (fromDomain && returnPathDomain && orgDomain(fromDomain) !== orgDomain(returnPathDomain)) {
      signals.push({ level: 'medium', reason: `Return-Path mismatch — sender domain (${fromDomain}) ≠ bounce address domain (${returnPathDomain})`, deduction: 10, category: 'identity' });
    }

    if (fromDomain && replyToDomain && orgDomain(fromDomain) !== orgDomain(replyToDomain)) {
      signals.push({ level: 'low', reason: `Reply-To mismatch — replies go to ${replyToDomain}, not ${fromDomain}`, deduction: 5, category: 'identity' });
    }

    if (fromDomain && msgIdDomain && orgDomain(fromDomain) !== orgDomain(msgIdDomain)) {
      signals.push({ level: 'low', reason: `Message-ID mismatch — internal ID domain (${msgIdDomain}) ≠ sender (${fromDomain})`, deduction: 5, category: 'identity' });
    }

    // ── Transport security deductions ─────────────────────────────────────────
    const hopsWithProtocol = hopsOrdered.filter(h => h.protocol !== null).length;
    const hopsWithTls      = hopsOrdered.filter(h => h.usedTls).length;

    if (hopsWithProtocol > 0) {
      if (hopsWithTls === 0) {
        signals.push({ level: 'high', reason: 'No encryption — the email traveled over unencrypted connections', deduction: 20, category: 'transport' });
      } else if (hopsWithTls < hopsWithProtocol) {
        const missing = hopsWithProtocol - hopsWithTls;
        signals.push({ level: 'medium', reason: `Partial encryption — ${missing} of ${hopsWithProtocol} servers sent without encryption`, deduction: 10, category: 'transport' });
      }
    }

    for (let i = 1; i < hopsOrdered.length; i++) {
      const prev = hopsOrdered[i - 1].timestamp;
      const curr = hopsOrdered[i].timestamp;
      if (!prev || !curr) continue;
      const diffH = (curr - prev) / (1000 * 60 * 60);
      if (diffH > 24) {
        signals.push({ level: 'high', reason: `Long delay — email held for ~${Math.round(diffH)} hours before hop ${i + 1}`, deduction: 10, category: 'transport' });
      } else if (diffH > 2) {
        signals.push({ level: 'medium', reason: `Moderate delay — email held for ~${Math.round(diffH * 10) / 10} hours before hop ${i + 1}`, deduction: 5, category: 'transport' });
      }
    }

    // ── Final score ───────────────────────────────────────────────────────────
    const totalDeduction = signals.reduce((sum, s) => sum + s.deduction, 0);
    const score = Math.max(0, Math.min(100, 100 - totalDeduction));

    let grade, verdict;
    if (score >= 90)      { grade = 'A'; verdict = 'Looks genuine — all security checks passed'; }
    else if (score >= 75) { grade = 'B'; verdict = 'Mostly genuine — minor issues detected'; }
    else if (score >= 55) { grade = 'C'; verdict = 'Some concerns — review the security signals below'; }
    else if (score >= 35) { grade = 'D'; verdict = 'Multiple failures — treat this email with caution'; }
    else                  { grade = 'F'; verdict = 'High risk — this email may be spoofed or malicious'; }

    return {
      score, grade, verdict, signals,
      auth: auth ? { ...auth, dkimDomain, dkimSelector, dkimAlg } : null,
      hopsOrdered,
      fromDomain, returnPathDomain, replyToDomain, msgIdDomain,
    };
  }

  // ── Grade and badge helpers ───────────────────────────────────────────────────

  function gradeClass(grade) {
    const map = { A: '', B: 'grade-b', C: 'grade-c', D: 'grade-d', F: 'grade-f' };
    return map[grade] || '';
  }

  function signalBadgeClass(level) {
    const map = { critical: 'risk-critical', high: 'risk-high', medium: 'risk-medium', low: 'risk-low', info: 'risk-info' };
    return map[level] || 'risk-low';
  }

  function verdictClass(verdict) {
    const v = verdict || 'missing';
    if (v === 'pass')     return 'email-verdict email-verdict--pass';
    if (v === 'fail')     return 'email-verdict email-verdict--fail';
    if (v === 'softfail') return 'email-verdict email-verdict--warn';
    return 'email-verdict email-verdict--none';
  }

  // ── Render: score panel ───────────────────────────────────────────────────────

  function renderScore(score, grade, verdict) {
    const section = el('div', 'link-score-section');
    const gc = gradeClass(grade);
    section.appendChild(el('span', 'link-score-number' + (gc ? ' ' + gc : ''), String(score)));
    section.appendChild(el('span', 'link-score-grade', grade));

    const info = el('div', 'link-score-info');
    info.appendChild(el('span', 'link-score-verdict', verdict));
    info.appendChild(el('span', 'link-score-sub', 'Trust score out of 100 · analyzed entirely in your browser'));
    section.appendChild(info);
    return section;
  }

  // ── Render: authentication results ───────────────────────────────────────────

  function renderAuth(auth) {
    const wrapper = el('div', 'email-auth-section');
    wrapper.appendChild(sectionHeader('Authentication Results', 'Did the email pass security checks?'));

    const block = el('div', 'output-block');
    const list  = el('div', 'email-auth-list');

    const rows = [
      {
        label:  'SPF',
        verdict: auth ? auth.verdicts.spf   : null,
        detail:  auth?.spfMailfrom ? 'smtp.mailfrom=' + auth.spfMailfrom : null,
      },
      {
        label:  'DKIM',
        verdict: auth ? auth.verdicts.dkim  : null,
        detail: auth ? [
          auth.dkimDomain   ? 'd=' + auth.dkimDomain   : null,
          auth.dkimSelector ? 's=' + auth.dkimSelector : null,
          auth.dkimAlg      ? 'a=' + auth.dkimAlg      : null,
        ].filter(Boolean).join('  ') || null : null,
      },
      {
        label:  'DMARC',
        verdict: auth ? auth.verdicts.dmarc : null,
        detail:  auth?.dmarcPolicy ? 'p=' + auth.dmarcPolicy.toUpperCase() : null,
      },
    ];

    for (const row of rows) {
      const rowEl = el('div', 'email-auth-row');
      rowEl.appendChild(el('span', 'email-auth-label', row.label));
      const verdictText = row.verdict || 'missing';
      rowEl.appendChild(el('span', verdictClass(verdictText), verdictText));
      if (row.detail) rowEl.appendChild(el('span', 'email-auth-detail', row.detail));
      list.appendChild(rowEl);
    }

    block.appendChild(list);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Render: security signals ──────────────────────────────────────────────────

  function renderSignals(signals) {
    if (!signals || signals.length === 0) return null;
    const wrapper = el('div', 'email-signals');
    wrapper.appendChild(sectionHeader('Security Signals', 'Flags that reduced the score'));

    const block = el('div', 'output-block');
    const list  = el('div', 'link-signal-list');
    for (const sig of signals) {
      const row = el('div', 'link-signal-row');
      row.appendChild(el('span', 'risk-badge ' + signalBadgeClass(sig.level), sig.level));
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

  // ── Render: email summary ─────────────────────────────────────────────────────

  function renderSummary(headers) {
    const wrapper = el('div', 'email-summary-section');
    wrapper.appendChild(sectionHeader('Email Summary', 'Key details extracted from the headers'));

    const block = el('div', 'output-block');
    const grid  = el('div', 'output-grid link-info-grid');

    const fields = [
      ['From',        getFirst(headers, 'from')],
      ['To',          getFirst(headers, 'to')],
      ['Reply-To',    getFirst(headers, 'reply-to')],
      ['Return-Path', getFirst(headers, 'return-path')],
      ['Date',        getFirst(headers, 'date')],
      ['Subject',     getFirst(headers, 'subject')],
      ['Message-ID',  getFirst(headers, 'message-id')],
    ];

    for (const [label, value] of fields) {
      if (!value) continue;
      grid.appendChild(el('span', 'output-label', label));
      grid.appendChild(el('span', 'output-value', value));
    }

    block.appendChild(grid);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Render: received chain ────────────────────────────────────────────────────

  function formatDelay(ms) {
    if (ms === null || ms === undefined || ms < 0) return '—';
    const s = Math.round(Math.abs(ms) / 1000);
    if (s < 60)  return s + 's';
    const m = Math.round(s / 60);
    if (m < 60)  return m + 'm';
    return Math.round(m / 60) + 'h';
  }

  function renderChain(hopsOrdered) {
    if (!hopsOrdered || hopsOrdered.length === 0) return null;

    const wrapper = el('div', 'email-chain-section');
    wrapper.appendChild(sectionHeader('Received Chain', 'Servers this email passed through, originating server first'));

    const block = el('div', 'output-block');
    const table = el('div', 'email-hop-table');

    // Column header row
    const hdr = el('div', 'email-hop-row email-hop-header');
    for (const h of ['#', 'From', 'By', 'Protocol', 'Delay']) {
      hdr.appendChild(el('span', '', h));
    }
    table.appendChild(hdr);

    for (let i = 0; i < hopsOrdered.length; i++) {
      const hop  = hopsOrdered[i];
      const prev = i > 0 ? hopsOrdered[i - 1] : null;
      const delayMs = (prev?.timestamp && hop.timestamp) ? (hop.timestamp - prev.timestamp) : null;
      const isFirst = i === 0;

      const row = el('div', 'email-hop-row' + (isFirst ? ' email-hop-first' : ''));

      // Hop number
      row.appendChild(el('span', 'email-hop-num', String(i + 1)));

      // From column: hostname + IP badge + optional OSINT link
      const fromCell = el('span', 'email-hop-from');
      if (hop.fromHost) fromCell.appendChild(el('span', 'email-hop-host', hop.fromHost));
      if (hop.ip) {
        fromCell.appendChild(el('span', 'email-hop-ip', '[' + hop.ip + ']'));
        if (isFirst) {
          const osintLink = document.createElement('a');
          osintLink.href      = '/tools/osint/?q=' + encodeURIComponent(hop.ip);
          osintLink.className = 'email-osint-link';
          osintLink.textContent = '→ OSINT';
          osintLink.target    = '_blank';
          osintLink.rel       = 'noopener noreferrer';
          fromCell.appendChild(osintLink);
        }
      }
      if (!hop.fromHost && !hop.ip) fromCell.textContent = '—';
      row.appendChild(fromCell);

      // By column
      row.appendChild(el('span', 'email-hop-by', hop.byHost || '—'));

      // Protocol column
      const protoCell = el('span', 'email-hop-proto');
      if (hop.protocol) {
        protoCell.appendChild(el('span', 'email-tls-badge ' + (hop.usedTls ? 'email-tls-on' : 'email-tls-off'), hop.protocol));
      } else {
        protoCell.textContent = '—';
      }
      row.appendChild(protoCell);

      // Delay column
      row.appendChild(el('span', 'email-hop-delay', i === 0 ? '—' : formatDelay(delayMs)));

      table.appendChild(row);
    }

    block.appendChild(table);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Render: identity analysis ─────────────────────────────────────────────────

  function renderIdentity(result) {
    const { auth, fromDomain, returnPathDomain, replyToDomain, msgIdDomain } = result;
    if (!fromDomain) return null;

    const wrapper = el('div', 'email-identity-section');
    wrapper.appendChild(sectionHeader('Identity Analysis', 'Do the sender addresses all match up?'));

    const block = el('div', 'output-block');
    const grid  = el('div', 'output-grid link-info-grid');

    function identityRow(label, domain, refDomain) {
      grid.appendChild(el('span', 'output-label', label));
      if (!domain) {
        grid.appendChild(el('span', 'output-value output-value--null', '—'));
        return;
      }
      const mismatch = refDomain !== null && orgDomain(domain) !== orgDomain(refDomain);
      const valueEl = el('span', mismatch ? 'output-value output-value--warn' : 'output-value',
        domain + (mismatch ? ' ← mismatch' : ''));
      grid.appendChild(valueEl);
    }

    identityRow('From domain',        fromDomain,       null);
    if (auth?.dkimDomain)   identityRow('DKIM d= domain',      auth.dkimDomain,    fromDomain);
    if (returnPathDomain)   identityRow('Return-Path domain',  returnPathDomain,   fromDomain);
    if (replyToDomain)      identityRow('Reply-To domain',     replyToDomain,      fromDomain);
    if (msgIdDomain)        identityRow('Message-ID domain',   msgIdDomain,        fromDomain);

    block.appendChild(grid);
    wrapper.appendChild(block);
    return wrapper;
  }

  // ── Render: OSINT deep dive ───────────────────────────────────────────────────

  function interpretSendingInfrastructure(org, reverseDns) {
    const combined = ((org || '') + ' ' + (reverseDns || '')).toLowerCase();
    const has = (...keys) => keys.some(k => combined.includes(k));

    if (has('mailgun'))                              return { label: 'Mailgun (email service)',          type: 'mail' };
    if (has('sendgrid'))                             return { label: 'SendGrid (email service)',          type: 'mail' };
    if (has('sparkpost'))                            return { label: 'SparkPost (email service)',         type: 'mail' };
    if (has('mailchimp', 'mandrill'))                return { label: 'Mailchimp (email service)',         type: 'mail' };
    if (has('postmark'))                             return { label: 'Postmark (email service)',          type: 'mail' };
    if (has('amazonses', 'amazon ses'))              return { label: 'Amazon SES (email service)',        type: 'mail' };
    if (has('google'))                               return { label: 'Google mail servers',              type: 'mail' };
    if (has('microsoft', 'hotmail.com', 'outlook.com')) return { label: 'Microsoft mail servers',       type: 'mail' };
    if (has('yahoo'))                                return { label: 'Yahoo mail servers',               type: 'mail' };
    if (has('protonmail', 'proton.me', 'proton ag')) return { label: 'Proton Mail servers',              type: 'mail' };
    if (has('fastmail'))                             return { label: 'Fastmail servers',                 type: 'mail' };
    if (has('amazon', 'aws', 'amazonaws'))           return { label: 'Amazon AWS (cloud hosting)',       type: 'cloud' };
    if (has('digitalocean'))                         return { label: 'DigitalOcean (cloud hosting)',     type: 'cloud' };
    if (has('linode', 'akamai'))                     return { label: 'Akamai / Linode (cloud hosting)',  type: 'cloud' };
    if (has('vultr'))                                return { label: 'Vultr (cloud hosting)',            type: 'cloud' };
    if (has('hetzner'))                              return { label: 'Hetzner (cloud hosting)',          type: 'cloud' };
    if (has('ovh'))                                  return { label: 'OVH (hosting)',                    type: 'cloud' };
    if (has('cloudflare'))                           return { label: 'Cloudflare',                       type: 'cloud' };
    return null;
  }

  function renderOsintIpResult(data, target) {
    const section = osintSection('Originating IP — ' + target);
    const g = osintGrid();

    const geo = data.geo;
    const location = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ') : null;
    if (location) osintRow(g, 'Location', osintTag(location, 'data'));

    const infra = interpretSendingInfrastructure(geo?.org, data.reverseDns);
    if (infra) {
      osintRow(g, 'Sent via', osintTag(infra.label, 'data'));
    } else if (geo?.org) {
      osintRow(g, 'Sent via', osintTag(geo.org.replace(/^AS\d+\s+/, ''), 'data'));
    }
    if (data.reverseDns) osintRow(g, 'Hostname', osintTag(data.reverseDns, 'faint'));

    if (infra?.type === 'cloud') {
      osintRow(g, 'Assessment', osintTag('⚠ Cloud hosting — verify the sender is legitimate', 'warn'));
    } else if (infra?.type === 'mail') {
      osintRow(g, 'Assessment', osintTag('✓ Known mail service', 'good'));
    }

    section.appendChild(g);
    return section;
  }

  function renderOsintDomainResult(data, target) {
    const section = osintSection('Sender Domain — ' + target);
    const g = osintGrid();

    osintRow(g, 'Spoof Protection',
      data.isSpoofable
        ? osintTag('⚠ None — anyone can send mail as this domain', 'warn')
        : osintTag('✓ Protected — domain policy blocks spoofed mail', 'good'));

    if (data.rdap) {
      const reg = data.rdap.events?.registration;
      if (reg) {
        const regDate  = new Date(reg);
        const diffDays = Math.floor((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24));
        if (!isNaN(diffDays) && diffDays >= 0) {
          const months = Math.floor(diffDays / 30);
          const years  = Math.floor(diffDays / 365);
          let age;
          if (diffDays < 30)    age = diffDays + (diffDays === 1 ? ' day' : ' days') + ' old';
          else if (months < 12) age = months + (months === 1 ? ' month' : ' months') + ' old';
          else                  age = years + (years === 1 ? ' year' : ' years') + ' old';
          const isFresh = diffDays < 180;
          osintRow(g, 'Registered',
            osintTag(reg.substring(0, 10) + ' (' + age + ')' + (isFresh ? ' — recently registered' : ''), isFresh ? 'warn' : 'data'));
        }
      }
      if (data.rdap.registrar) {
        osintRow(g, 'Registrar', osintTag(data.rdap.registrar, 'faint'));
      }
    }

    section.appendChild(g);
    return section;
  }

  function renderOsint(originatingIp, fromDomain) {
    if (!originatingIp && !fromDomain) return null;

    const wrapper = el('div', 'email-osint-section');
    wrapper.appendChild(sectionHeader('OSINT Deep Dive',
      'Optional — queries the originating IP and sender domain via server-side lookup'));

    const targets = [];
    if (originatingIp) targets.push('Originating IP: ' + originatingIp);
    if (fromDomain)    targets.push('Sender domain: '  + fromDomain);
    wrapper.appendChild(el('p', 'email-osint-prompt', targets.join(' · ')));

    const btn = el('button', 'btn', 'Run OSINT Analysis');
    btn.type = 'button';
    wrapper.appendChild(btn);

    const loadingEl = el('p', 'email-osint-loading u-hidden', 'Fetching OSINT data…');
    wrapper.appendChild(loadingEl);

    const osintErrorEl = el('p', 'email-osint-error u-hidden');
    wrapper.appendChild(osintErrorEl);

    const resultArea = el('div', 'email-osint-results u-hidden');
    wrapper.appendChild(resultArea);

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      loadingEl.classList.remove('u-hidden');
      osintErrorEl.classList.add('u-hidden');
      resultArea.classList.add('u-hidden');

      const tasks = [];
      if (originatingIp) {
        tasks.push(
          fetch('/api/osint?mode=ip&target=' + encodeURIComponent(originatingIp))
            .then(r => r.json())
            .then(j => ({ kind: 'ip', payload: j }))
        );
      }
      if (fromDomain) {
        tasks.push(
          fetch('/api/osint?mode=domain&target=' + encodeURIComponent(fromDomain))
            .then(r => r.json())
            .then(j => ({ kind: 'domain', payload: j }))
        );
      }

      const settled = await Promise.allSettled(tasks);

      loadingEl.classList.add('u-hidden');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Refresh';

      resultArea.replaceChildren();

      let anySuccess = false;
      for (const r of settled) {
        if (r.status === 'rejected' || r.value.payload.error) continue;
        anySuccess = true;
        const { kind, payload } = r.value;
        if (kind === 'ip')     resultArea.appendChild(renderOsintIpResult(payload.data, payload.target));
        if (kind === 'domain') resultArea.appendChild(renderOsintDomainResult(payload.data, payload.target));
      }

      if (!anySuccess) {
        osintErrorEl.textContent = 'OSINT lookup failed — check your connection and try again.';
        osintErrorEl.classList.remove('u-hidden');
      }

      resultArea.classList.remove('u-hidden');
    });

    return wrapper;
  }

  // ── Render: privacy notice ────────────────────────────────────────────────────

  function renderPrivacy() {
    return el('p', 'link-privacy',
      'All header analysis runs in your browser. No header data is sent to any server. ' +
      'Clicking "Run OSINT Analysis" sends the originating IP and sender domain to the site\'s OSINT API.');
  }

  // ── Full results render ───────────────────────────────────────────────────────

  function renderResults(headers, result) {
    resultsEl.replaceChildren();

    const originatingIp = result.hopsOrdered.length > 0 ? result.hopsOrdered[0].ip : null;

    const scoreEl = renderScore(result.score, result.grade, result.verdict);
    scoreEl.tabIndex = -1;
    resultsEl.appendChild(scoreEl);
    resultsEl.appendChild(renderAuth(result.auth));

    const signals = renderSignals(result.signals);
    if (signals) resultsEl.appendChild(signals);

    resultsEl.appendChild(renderSummary(headers));

    const chain = renderChain(result.hopsOrdered);
    if (chain) resultsEl.appendChild(chain);

    const identity = renderIdentity(result);
    if (identity) resultsEl.appendChild(identity);

    const osint = renderOsint(originatingIp, result.fromDomain);
    if (osint) resultsEl.appendChild(osint);

    resultsEl.appendChild(renderPrivacy());

    resultsEl.classList.remove('u-hidden');
    requestAnimationFrame(() => scoreEl.focus());
  }

  // ── Main analyze function ─────────────────────────────────────────────────────

  function analyze() {
    clearError();
    const raw = inputEl.value.trim();
    if (!raw) {
      showError('Paste email headers or full email source to analyze.');
      return;
    }
    try {
      const headers = parseRawHeaders(raw);
      if (headers.length === 0) {
        showError('No valid headers found. Make sure you pasted email headers or full email source.');
        return;
      }
      const result = computeScore(headers);
      renderResults(headers, result);
    } catch (err) {
      showError(err.message || 'Failed to parse. Make sure you pasted email headers or full email source.');
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  analyzeBtn.addEventListener('click', analyze);

})();
