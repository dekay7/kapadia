/**
 * OSINT Digital Footprint Checker — kapadia.org
 * Client-side controller for /tools/osint/
 */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  let currentMode = 'ip';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const tabs        = document.querySelectorAll('.osint-tab');
  const panels      = document.querySelectorAll('.mode-panel');
  const inputs      = {
    ip:       document.getElementById('osint-ip-input'),
    domain:   document.getElementById('osint-domain-input'),
    username: document.getElementById('osint-username-input'),
    email:    document.getElementById('osint-email-input'),
  };
  const buttons     = {
    ip:       document.getElementById('osint-ip-btn'),
    domain:   document.getElementById('osint-domain-btn'),
    username: document.getElementById('osint-username-btn'),
    email:    document.getElementById('osint-email-btn'),
  };
  const selfBtn     = document.getElementById('osint-self-btn');
  const loadingEl   = document.getElementById('osint-loading');
  const errorEl     = document.getElementById('osint-error');
  const resultsEl   = document.getElementById('osint-results');
  const resultsBody = document.getElementById('osint-results-body');

  // ── Tab switching ───────────────────────────────────────────────────────────
  tabs.forEach(tab => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', tab.dataset.mode === currentMode ? 'true' : 'false');
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      if (!mode) return;
      currentMode = mode;

      tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
        t.setAttribute('aria-selected', t.dataset.mode === mode ? 'true' : 'false');
      });
      panels.forEach(p => p.classList.toggle('active', p.dataset.panel === mode));

      clearResults();
    });
  });

  // ── Keyboard: submit on Enter ───────────────────────────────────────────────
  Object.values(inputs).forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') runCheck();
    });
  });

  // ── Button clicks ───────────────────────────────────────────────────────────
  Object.entries(buttons).forEach(([mode, btn]) => {
    if (!btn) return;
    btn.addEventListener('click', runCheck);
  });

  if (selfBtn) {
    selfBtn.addEventListener('click', () => {
      currentMode = 'ip';
      tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.mode === 'ip');
        t.setAttribute('aria-selected', t.dataset.mode === 'ip' ? 'true' : 'false');
      });
      panels.forEach(p => p.classList.toggle('active', p.dataset.panel === 'ip'));
      if (inputs.ip) inputs.ip.value = '';
      runCheck('self');
    });
  }

  // ── Main runner ─────────────────────────────────────────────────────────────
  async function runCheck(overrideTarget) {
    // If called from an event listener, the first arg is an Event object.
    // We want to ignore it and use the input value unless it's an explicit string (like 'self').
    const isExplicitString = typeof overrideTarget === 'string';
    const target = isExplicitString
      ? overrideTarget
      : (inputs[currentMode]?.value || '').trim();

    if (!target && overrideTarget !== 'self') {
      showError('Please enter a value to investigate.');
      return;
    }

    setLoading(true);
    clearResults();

    try {
      const url = `/api/osint?mode=${encodeURIComponent(currentMode)}&target=${encodeURIComponent(target || 'self')}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.error) {
        showError(json.error);
        return;
      }

      renderResults(currentMode, json);
    } catch (err) {
      showError('Request failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function renderResults(mode, json) {
    resultsBody.replaceChildren();

    switch (mode) {
      case 'ip':       renderIP(json.data, json.target);       break;
      case 'domain':   renderDomain(json.data, json.target);   break;
      case 'username': renderUsername(json.data);               break;
      case 'email':    renderEmail(json.data);                  break;
    }

    // Timestamp
    const ts = document.createElement('p');
    ts.className = 'osint-timestamp';
    ts.textContent = `Checked at ${new Date(json.timestamp).toLocaleTimeString()} · kapadia.org`;
    resultsBody.appendChild(ts);

    resultsEl.style.display = 'block';
  }

  // ── IP Results ──────────────────────────────────────────────────────────────
  function renderIP(data, queriedTarget) {
    const ip = data.ip || queriedTarget;

    // Section: Network Identity
    const netSection = section('Network Identity');
    const netGrid = grid();
    row(netGrid, 'IP Address', tag(ip, 'data'));
    row(netGrid, 'Classification', badge(data.classification || 'public'));
    if (data.reverseDns) row(netGrid, 'Reverse DNS (PTR)', tag(data.reverseDns, 'link'));
    else                  row(netGrid, 'Reverse DNS (PTR)', tag('No PTR record', 'faint'));
    netSection.appendChild(netGrid);
    resultsBody.appendChild(netSection);

    // Section: Geolocation
    if (data.geo) {
      const g = data.geo;
      const geoSection = section('Geolocation');
      const geoGrid = grid();
      if (g.city || g.region)  row(geoGrid, 'Location', tag([g.city, g.region, g.country].filter(Boolean).join(', '), 'data'));
      if (g.countryCode)        row(geoGrid, 'Country Code', tag(g.countryCode, 'data'));
      if (g.postal)             row(geoGrid, 'Postal Code', tag(g.postal, 'data'));
      if (g.timezone)           row(geoGrid, 'Timezone', tag(g.timezone, 'data'));
      if (g.utcOffset)          row(geoGrid, 'UTC Offset', tag(g.utcOffset, 'data'));
      if (g.latitude && g.longitude) {
        const mapLink = `https://www.openstreetmap.org/?mlat=${g.latitude}&mlon=${g.longitude}#map=12/${g.latitude}/${g.longitude}`;
        row(geoGrid, 'Coordinates', linkTag(`${g.latitude}, ${g.longitude}`, mapLink));
      }
      geoSection.appendChild(geoGrid);
      resultsBody.appendChild(geoSection);

      // Section: ASN / Network
      const netOrgSection = section('Network & ASN');
      const netOrgGrid = grid();
      if (g.org) row(netOrgGrid, 'Organisation', tag(g.org, 'data'));
      if (g.asn) row(netOrgGrid, 'ASN', tag(g.asn, 'data'));
      if (g.languages) row(netOrgGrid, 'Region Languages', tag(g.languages, 'faint'));
      if (g.currency)  row(netOrgGrid, 'Currency', tag(g.currency, 'faint'));
      netOrgSection.appendChild(netOrgGrid);
      resultsBody.appendChild(netOrgSection);
    } else {
      const noGeo = section('Geolocation');
      noGeo.appendChild(msg('Geolocation data unavailable for this IP.', 'faint'));
      resultsBody.appendChild(noGeo);
    }
  }

  // ── Domain Results ──────────────────────────────────────────────────────────
  function renderDomain(data, domain) {
    // Section: RDAP / WHOIS
    const rdapSection = section('WHOIS / Registration');
    if (data.rdap) {
      const r = data.rdap;
      const rdapGrid = grid();
      if (r.registrar)  row(rdapGrid, 'Registrar', tag(r.registrar, 'data'));
      if (r.registrant) row(rdapGrid, 'Registrant', tag(r.registrant, 'data'));
      if (r.events?.registration) row(rdapGrid, 'Registered', tag(r.events.registration?.substring(0, 10), 'data'));
      if (r.events?.expiration)   row(rdapGrid, 'Expires', tag(r.events.expiration?.substring(0, 10), 'data'));
      if (r.events?.['last changed']) row(rdapGrid, 'Last Updated', tag(r.events['last changed']?.substring(0, 10), 'data'));
      if (r.status?.length)  row(rdapGrid, 'Status', tag(r.status.join(', '), 'faint'));
      if (r.nameservers?.length) row(rdapGrid, 'Nameservers', tag(r.nameservers.join(', '), 'data'));
      rdapSection.appendChild(rdapGrid);
    } else {
      rdapSection.appendChild(msg('RDAP data not available for this domain.', 'faint'));
    }
    resultsBody.appendChild(rdapSection);

    // Section: DNS Records
    const dnsSection = section('DNS Records');
    if (Object.keys(data.dns || {}).length > 0) {
      const types = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA'];
      types.forEach(type => {
        if (!data.dns[type]?.length) return;
        const typeHeader = document.createElement('p');
        typeHeader.className = 'osint-rec-type';
        typeHeader.textContent = type;
        dnsSection.appendChild(typeHeader);

        const recGrid = grid();
        data.dns[type].forEach(rec => {
          row(recGrid, `TTL ${rec.ttl}`, tag(rec.data, 'data'));
        });
        dnsSection.appendChild(recGrid);
      });
    } else {
      dnsSection.appendChild(msg('No DNS records found.', 'faint'));
    }
    resultsBody.appendChild(dnsSection);

    // Section: Email Security
    const mailSection = section('Email Security (SPF / DMARC)');
    const mailGrid = grid();
    row(mailGrid, 'Spoofing Protection', data.isSpoofable ? tag('⚠ Spoofable', 'warn') : tag('✓ Protected', 'good'));
    row(mailGrid, 'SPF',   data.spf   ? tag(`✓ ${data.spfStatus || 'Present'}`, data.spfStatus?.includes('+all') ? 'warn' : 'good') : tag('✗ Not set', 'warn'));
    row(mailGrid, 'DMARC', data.dmarc ? tag(`✓ ${data.dmarcStatus || 'Present'}`, data.dmarcStatus?.includes('none') ? 'warn' : 'good') : tag('✗ Not set', 'warn'));
    if (data.spf)   row(mailGrid, 'SPF record',   tag(data.spf,   'data'));
    if (data.dmarc) row(mailGrid, 'DMARC record', tag(data.dmarc, 'data'));
    mailSection.appendChild(mailGrid);
    resultsBody.appendChild(mailSection);

    // Section: Certificate Transparency
    const certSection = section(`Certificate Transparency (${data.subdomains?.length || 0} unique subdomains${data.certCount > 0 ? ` from ${data.certCount} certs` : ''})`);
    if (data.subdomains?.length > 0) {
      const certGrid = grid();
      data.subdomains.forEach(sub => {
        row(certGrid, sub.notBefore?.substring(0, 10) || '—', tag(sub.name, 'link'));
      });
      certSection.appendChild(certGrid);
    } else {
      certSection.appendChild(msg('No certificate records found in crt.sh', 'faint'));
    }
    resultsBody.appendChild(certSection);
  }

  // ── Username Results ────────────────────────────────────────────────────────
  function renderUsername(data) {
    const username = data.username;
    const platforms = data.platforms || {};

    const found    = Object.values(platforms).filter(p => p.found);
    const notFound = Object.values(platforms).filter(p => !p.found);

    // Summary
    const summarySection = section('Platform Summary');
    const summGrid = grid();
    row(summGrid, 'Checked platforms', tag(Object.keys(platforms).length, 'data'));
    row(summGrid, 'Found on',          tag(found.length, found.length > 0 ? 'good' : 'faint'));
    row(summGrid, 'Not found on',      tag(notFound.length, 'faint'));
    summarySection.appendChild(summGrid);
    resultsBody.appendChild(summarySection);

    // Found platforms
    found.forEach(p => {
      const ps = section(`${p.label} — @${username}`);
      const pg = grid();
      row(pg, 'Profile URL', linkTag(p.profileUrl, p.profileUrl));

      if (p.data) {
        Object.entries(p.data).forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          row(pg, label, tag(String(v), 'data'));
        });
      }
      ps.appendChild(pg);
      resultsBody.appendChild(ps);
    });

    // Not found
    if (notFound.length > 0) {
      const nfSection = section('Not Found');
      const nfGrid = grid();
      notFound.forEach(p => {
        row(nfGrid, p.label, tag('✗ Profile not found', 'faint'));
      });
      nfSection.appendChild(nfGrid);
      resultsBody.appendChild(nfSection);
    }
  }

  // ── Email Results ───────────────────────────────────────────────────────────
  function renderEmail(data) {
    // ── Overview
    const overSection = section('Email Analysis');
    const overGrid = grid();
    row(overGrid, 'Address',     tag(data.email, 'data'));
    row(overGrid, 'Local Part',  tag(data.localPart, 'data'));
    row(overGrid, 'Domain',      tag(data.domain, 'data'));
    row(overGrid, 'Mail Server', data.hasMailRecords ? tag('✓ Configured', 'good') : tag('✗ No MX records', 'warn'));
    row(overGrid, 'Free Provider', data.isFreeProvider ? tag('Yes', 'faint') : tag('No (custom domain)', 'data'));
    row(overGrid, 'Disposable',    data.isDisposable   ? tag('⚠ Likely disposable', 'warn') : tag('Not in blocklist', 'good'));
    row(overGrid, 'Spoofing Protection', data.isSpoofable ? tag('⚠ Domain is spoofable', 'warn') : tag('✓ Protected', 'good'));
    if (data.mailProvider) row(overGrid, 'Mail Provider', tag(data.mailProvider, 'data'));
    if (data.domainHasWebsite !== undefined) row(overGrid, 'Has Website', data.domainHasWebsite ? tag('✓ Yes', 'good') : tag('✗ No A record', 'faint'));
    overSection.appendChild(overGrid);
    resultsBody.appendChild(overSection);

    // ── MX Records
    const mxSection = section('MX Records');
    if (data.mx?.length > 0) {
      const mxGrid = grid();
      data.mx.forEach(mx => {
        row(mxGrid, `Priority ${mx.priority}`, tag(mx.exchange, 'data'));
      });
      mxSection.appendChild(mxGrid);
    } else {
      mxSection.appendChild(msg('No MX records found. This domain cannot receive email.', 'warn'));
    }
    resultsBody.appendChild(mxSection);

    // ── SPF
    const spfSection = section('SPF (Sender Policy Framework)');
    const spfGrid = grid();
    if (data.hasSPF) {
      const spfBad = data.spfStatus?.includes('+all');
      row(spfGrid, 'Status', tag(`✓ ${data.spfStatus || 'Present'}`, spfBad ? 'warn' : 'good'));
      if (data.spfLookupCount !== undefined) {
        const lookupText = `${data.spfLookupCount} of 10 lookups`;
        const lookupType = data.spfLookupWarning === 'exceeded' ? 'warn'
          : data.spfLookupWarning === 'approaching' ? 'warn' : 'faint';
        row(spfGrid, 'DNS Lookups', tag(
          data.spfLookupWarning === 'exceeded' ? `⚠ ${lookupText} — limit exceeded`
          : data.spfLookupWarning === 'approaching' ? `⚠ ${lookupText} — approaching limit`
          : lookupText,
          lookupType
        ));
      }
      // All record values rendered as text — never innerHTML (XSS prevention)
      row(spfGrid, 'Record', tag(data.spf, 'data'));
    } else {
      row(spfGrid, 'Status', tag('✗ Missing — email can be spoofed from this domain', 'warn'));
    }
    spfSection.appendChild(spfGrid);
    resultsBody.appendChild(spfSection);

    // ── DMARC
    const dmarcSection = section('DMARC (Domain-based Message Authentication)');
    const dmarcGrid = grid();
    if (data.hasDMARC) {
      const p = data.dmarcParsed;
      const policyBad = p?.policy === 'none';
      row(dmarcGrid, 'Policy', tag(
        p?.policy === 'reject' ? '✓ reject — spoof attempts blocked' :
        p?.policy === 'quarantine' ? '✓ quarantine — spoof attempts flagged' :
        '⚠ none — monitoring only, no enforcement',
        p?.policy === 'reject' || p?.policy === 'quarantine' ? 'good' : 'warn'
      ));
      if (p?.subdomainPolicy) {
        row(dmarcGrid, 'Subdomain Policy', tag(p.subdomainPolicy, p.subdomainPolicy === 'reject' || p.subdomainPolicy === 'quarantine' ? 'good' : 'warn'));
      }
      if (p?.pct !== undefined && p?.pct < 100) {
        row(dmarcGrid, 'Coverage', tag(`⚠ ${p.pct}% — partial enforcement`, 'warn'));
      } else if (p?.pct === 100) {
        row(dmarcGrid, 'Coverage', tag('100% — full enforcement', 'good'));
      }
      if (p?.aspf) row(dmarcGrid, 'SPF Alignment',  tag(p.aspf === 's' ? 'strict' : 'relaxed', 'faint'));
      if (p?.adkim) row(dmarcGrid, 'DKIM Alignment', tag(p.adkim === 's' ? 'strict' : 'relaxed', 'faint'));
      if (p?.rua?.length) row(dmarcGrid, 'Aggregate Reports', tag(p.rua.join(', '), 'faint'));
      if (p?.ruf?.length) row(dmarcGrid, 'Forensic Reports', tag(p.ruf.join(', '), 'faint'));
      row(dmarcGrid, 'Record', tag(data.dmarc, 'data'));
    } else {
      row(dmarcGrid, 'Status', tag('✗ Missing — no DMARC policy defined', 'warn'));
    }
    dmarcSection.appendChild(dmarcGrid);
    resultsBody.appendChild(dmarcSection);

    // ── DKIM
    const dkimSection = section('DKIM (DomainKeys Identified Mail)');
    const dkimGrid = grid();
    if (data.dkim?.found?.length > 0) {
      row(dkimGrid, 'Selectors Found', tag(`${data.dkim.found.length} of ${data.dkim.checkedCount || 12} checked`, 'good'));
      data.dkim.found.forEach(sel => {
        const keyLabel = sel.keyBits
          ? (sel.keyBits >= 2048 ? `${sel.keyBits}-bit ✓` : `${sel.keyBits}-bit ⚠ weak`)
          : 'key found';
        const keyType = sel.keyBits && sel.keyBits < 2048 ? 'warn' : 'good';
        row(dkimGrid, sel.selector, tag(keyLabel, keyType));
      });
    } else {
      row(dkimGrid, 'Status', tag(`✗ No DKIM selectors found (${data.dkim?.checkedCount || 12} common selectors checked)`, 'warn'));
    }
    dkimSection.appendChild(dkimGrid);
    resultsBody.appendChild(dkimSection);

    // ── Advanced email security standards
    const advSection = section('Advanced Email Security');
    const advGrid = grid();
    if (data.mtaSts !== undefined) {
      row(advGrid, 'MTA-STS', data.mtaSts.present
        ? tag('✓ Enforced — TLS required for inbound delivery', 'good')
        : tag('✗ Not configured', 'faint'));
    }
    if (data.tlsRpt !== undefined) {
      row(advGrid, 'TLS-RPT', data.tlsRpt.present
        ? tag('✓ Configured — TLS failure reporting active', 'good')
        : tag('✗ Not configured', 'faint'));
    }
    if (data.bimi !== undefined) {
      row(advGrid, 'BIMI', data.bimi.present
        ? tag('✓ Brand logo record found', 'good')
        : tag('✗ Not configured', 'faint'));
    }
    advSection.appendChild(advGrid);
    resultsBody.appendChild(advSection);
  }

  // ── UI Helpers ──────────────────────────────────────────────────────────────

  function section(title) {
    const el = document.createElement('div');
    el.className = 'osint-section';
    const h = document.createElement('h3');
    h.className = 'osint-section-title';
    h.textContent = title;
    el.appendChild(h);
    return el;
  }

  function grid() {
    const el = document.createElement('div');
    el.className = 'output-block';
    const g = document.createElement('div');
    g.className = 'output-grid';
    el.appendChild(g);
    return el;
  }

  function row(gridEl, label, valueEl) {
    const g = gridEl.querySelector('.output-grid') || gridEl;

    const lEl = document.createElement('span');
    lEl.className = 'output-label osint-label';
    lEl.textContent = label;

    g.appendChild(lEl);
    g.appendChild(valueEl);
  }

  function tag(value, type = 'data') {
    const el = document.createElement('span');
    el.className = `output-value osint-val-${type}`;
    el.textContent = value;
    return el;
  }

  function linkTag(text, href) {
    const el = document.createElement('a');
    el.className = 'output-value osint-val-link';
    el.textContent = text;
    el.href = href;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    return el;
  }

  function badge(text) {
    const map = {
      public:       'data',
      private:      'faint',
      cgnat:        'warn',
      'link-local': 'faint',
    };
    return tag(text, map[text] || 'data');
  }

  function msg(text, type = 'faint') {
    const el = document.createElement('div');
    el.className = `output-block`;
    const t = document.createElement('span');
    t.className = `output-text osint-val-${type}`;
    t.textContent = text;
    el.appendChild(t);
    return el;
  }

  function setLoading(on) {
    if (loadingEl) loadingEl.style.display = on ? 'flex' : 'none';
    // Disable all buttons
    Object.values(buttons).forEach(btn => {
      if (btn) btn.disabled = on;
    });
    if (selfBtn) selfBtn.disabled = on;
  }

  function showError(text) {
    if (!errorEl) return;
    errorEl.textContent = text;
    errorEl.style.display = 'block';
  }

  function clearResults() {
    if (errorEl)     { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    if (resultsEl)   resultsEl.style.display = 'none';
    if (resultsBody) resultsBody.replaceChildren();
  }

})();
