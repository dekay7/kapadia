/* ════════════════════════════════════════════════════════════════════════════
   speed.js — /speed/ page logic
   Parallel connections saturate high-speed links that a single TCP stream
   cannot fill due to slow-start. Free-plan safe: each request < 100 MB.
   ════════════════════════════════════════════════════════════════════════════ */

// ── Config ────────────────────────────────────────────────────────────────
const CFG = {
  // Ping: first PING_WARMUP samples are discarded from statistics
  pingCount:   20,
  pingWarmup:  3,
  pingTimeout: 3000,

  // Parallel streams for download + upload
  // Increased payload ceiling ensures fast connections have room to breathe,
  // while maxDuration ensures the test always stops at exactly 10 seconds.
  maxDuration: 10000, // 10 seconds per phase
  dlParallel:  4,
  dlMbEach:    100,  // MB per stream (400 MB total ceiling)

  ulParallel:  4,
  ulMbEach:    50,   // MB per stream (200 MB total ceiling)

  maxDlMbps:   1000,
  maxUlMbps:   1000,
  maxPingMs:   300,
  maxJitterMs: 100,
};

// Arc geometry — r=64, 270° arc on 152×152 viewBox
// circumference = 2π×64 = 402.12  |  270° arc = 301.59
const ARC_FULL = 301.59;

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const btnRun     = $('btn-run');
const phaseLabel = $('phase-label');

const gaugeEls = {
  dl:     { arc: $('arc-dl'),     val: $('val-dl'),     wrap: $('gauge-dl')     },
  ul:     { arc: $('arc-ul'),     val: $('val-ul'),     wrap: $('gauge-ul')     },
  ping:   { arc: $('arc-ping'),   val: $('val-ping'),   wrap: $('gauge-ping')   },
  jitter: { arc: $('arc-jitter'), val: $('val-jitter'), wrap: $('gauge-jitter') },
};

// ── Gauge helpers ─────────────────────────────────────────────────────────
function setGauge(key, value, maxValue, decimals = 1) {
  const { arc, val } = gaugeEls[key];
  const fraction = Math.min(1, Math.max(0, value / maxValue));
  arc.style.strokeDashoffset = ARC_FULL * (1 - fraction);
  val.textContent = value.toFixed(decimals);
}

function resetGauge(key) {
  gaugeEls[key].arc.style.strokeDashoffset = ARC_FULL;
  gaugeEls[key].val.textContent = '--';
}

function resetAll() {
  ['dl', 'ul', 'ping', 'jitter'].forEach(k => {
    resetGauge(k);
    gaugeEls[k].wrap.classList.remove('active');
  });
  $('details-section').classList.remove('visible');
}

function setActive(key) { gaugeEls[key].wrap.classList.add('active'); }

// ── Phase label ───────────────────────────────────────────────────────────
function setPhase(text, running = true, isComplete = false) {
  phaseLabel.textContent = text;
  phaseLabel.className = 'phase-label' + (running ? ' running' : '') + (isComplete ? ' complete' : '');
}

// ── Timeout wrapper ───────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ── Public IP ─────────────────────────────────────────────────────────────
async function loadIP() {
  try {
    const data = await fetch('/api/info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
    const ip = data?.ipv4 || data?.ipv6 || null;
    const el = $('speed-ip');
    if (ip && el) {
      el.textContent = ip;
      el.closest('.speed-ip-wrap').classList.add('visible');
    }
  } catch { /* silent */ }
}

// ── Ping phase ────────────────────────────────────────────────────────────
async function measurePing() {
  setPhase('pinging...');
  setActive('ping');
  setActive('jitter');

  const rtts = [];
  let lost = 0;
  let pop  = null;

  for (let i = 0; i < CFG.pingCount; i++) {
    const url = `https://speed.cloudflare.com/__down?bytes=0&r=${i}`;
    const t0  = performance.now();
    try {
      const res = await withTimeout(fetch(url, { cache: 'no-store', method: 'HEAD' }), CFG.pingTimeout);
      rtts.push(performance.now() - t0);
      if (!pop) {
        const ray = res.headers.get('cf-ray') || '';
        const parts = ray.split('-');
        if (parts.length >= 2) pop = parts[parts.length - 1].toUpperCase();
      }
    } catch { lost++; }

    // Update running stats (excluding warmup pings from display)
    const statRtts = rtts.slice(CFG.pingWarmup);
    if (statRtts.length > 0) {
      const mean   = statRtts.reduce((a, b) => a + b, 0) / statRtts.length;
      const jitter = statRtts.length > 1
        ? Math.sqrt(statRtts.map(t => (t - mean) ** 2).reduce((a, b) => a + b, 0) / statRtts.length)
        : 0;
      setGauge('ping',   mean,   CFG.maxPingMs,   0);
      setGauge('jitter', jitter, CFG.maxJitterMs, 1);
    }
  }

  // If POP was not in headers, grab it from our own API
  if (!pop) {
    try {
      const info = await fetch('/api/info').then(r => r.json());
      pop = info.colo;
    } catch {}
  }

  const statRtts   = rtts.slice(CFG.pingWarmup);
  const mean        = statRtts.length ? statRtts.reduce((a, b) => a + b, 0) / statRtts.length : 0;
  const jitter      = statRtts.length > 1
    ? Math.sqrt(statRtts.map(t => (t - mean) ** 2).reduce((a, b) => a + b, 0) / statRtts.length)
    : 0;
  const lossPercent = (lost / CFG.pingCount) * 100;

  return { mean, jitter, lossPercent, pop };
}

// ── Download phase — parallel streams ────────────────────────────────────
async function measureDownload() {
  setPhase('downloading...');
  setActive('dl');

  const t0 = performance.now();
  let totalBytes = 0;
  let timingEntry = null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CFG.maxDuration);

  // Fire all parallel streams simultaneously
  await Promise.all(
    Array.from({ length: CFG.dlParallel }, (_, i) =>
      fetch(`https://speed.cloudflare.com/__down?bytes=${CFG.dlMbEach * 1024 * 1024}&r=${i}`, { cache: 'no-store', signal: controller.signal })
        .then(async res => {
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.length;
            const elapsed = (performance.now() - t0) / 1000;
            if (elapsed > 0.1) setGauge('dl', (totalBytes * 8) / elapsed / 1e6, CFG.maxDlMbps);
          }
        }).catch(err => {
          if (err.name === 'AbortError') return;
          throw err;
        })
    )
  );

  clearTimeout(timeoutId);

  // Grab PerformanceTiming from one of the download requests
  const entries = performance.getEntriesByType('resource')
    .filter(e => e.name.includes('speed.cloudflare.com/__down'));
  if (entries.length) timingEntry = entries[entries.length - 1];

  const elapsed = (performance.now() - t0) / 1000;
  const mbps    = elapsed > 0 ? (totalBytes * 8) / elapsed / 1e6 : 0;
  setGauge('dl', mbps, CFG.maxDlMbps);
  return { mbps, timingEntry };
}

// ── Upload phase — parallel dynamic chunk streams ──────────────────────────
async function measureUpload() {
  setPhase('uploading...');
  setActive('ul');

  const t0 = performance.now();
  let confirmedSent = 0;
  let confirmedStreamTime = 0; // Sum of (tEnd - tStart) for successful chunks
  let isAborted = false;
  let activeWorkers = 0;

  const controller = new AbortController();

  async function uploadWorker(workerId) {
    let reqCount = 0;
    let chunkBytes = 100 * 1024; // Start with 100 KB
    let payload = new Blob([new Uint8Array(chunkBytes).map((_, i) => i & 0xff)]);
    let isFirst = true;

    while (!isAborted) {
      const tStart = performance.now();
      try {
        await fetch(`https://speed.cloudflare.com/__up?w=${workerId}&r=${reqCount++}`, {
          method: 'POST',
          body: payload,
          signal: controller.signal,
          cache: 'no-store'
        });
        
        const tEnd = performance.now();
        if (!isAborted) {
          if (isFirst) {
            isFirst = false;
            activeWorkers++;
          }
          const elapsedMs = tEnd - tStart;
          confirmedSent += chunkBytes;
          confirmedStreamTime += elapsedMs;
          
          // Calculate average speed per stream and multiply by active parallel streams
          const avgStreamSpeed = confirmedSent / confirmedStreamTime; // bytes per ms
          const totalSpeedBps = avgStreamSpeed * activeWorkers * 1000;
          setGauge('ul', (totalSpeedBps * 8) / 1e6, CFG.maxUlMbps);
          
          // Dynamically size chunks to target ~300ms per request (minimizes RTT overhead)
          if (elapsedMs < 150) {
             chunkBytes = Math.min(chunkBytes * 4, 15 * 1024 * 1024); // max 15MB
             payload = new Blob([new Uint8Array(chunkBytes).map((_, i) => i & 0xff)]);
          } else if (elapsedMs < 300) {
             chunkBytes = Math.min(chunkBytes * 2, 15 * 1024 * 1024);
             payload = new Blob([new Uint8Array(chunkBytes).map((_, i) => i & 0xff)]);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        // On network error, delay retry to prevent tight error loops
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  // Start concurrent continuous workers
  const workers = Array.from({ length: CFG.ulParallel }, (_, i) => uploadWorker(i));

  // Enforce exactly 10 seconds test duration
  await new Promise(resolve => setTimeout(resolve, CFG.maxDuration));
  isAborted = true;
  controller.abort();

  // Wait for all workers to cleanly exit
  await Promise.all(workers);

  // Final calculation
  let finalMbps = 0;
  if (confirmedStreamTime > 0) {
    const avgStreamSpeed = confirmedSent / confirmedStreamTime; // bytes per ms
    const totalSpeedBps = avgStreamSpeed * CFG.ulParallel * 1000; // bytes per second
    finalMbps = (totalSpeedBps * 8) / 1e6;
  }
  
  setGauge('ul', finalMbps, CFG.maxUlMbps);
  return finalMbps;
}

// ── Resource timing helpers ───────────────────────────────────────────────
function fmtMs(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return null;
  return ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`;
}

function extractTiming(entry) {
  if (!entry) return {};
  return {
    dns:  entry.domainLookupEnd  - entry.domainLookupStart,
    tls:  entry.secureConnectionStart > 0
            ? entry.connectEnd - entry.secureConnectionStart : null,
    ttfb: entry.responseStart - entry.requestStart,
  };
}

// ── Populate detail cards ─────────────────────────────────────────────────
function populateDetails({ lossPercent, pop, timingEntry }) {
  const timing = extractTiming(timingEntry);

  const set = (id, val, unit = '') => {
    const el = $(id);
    if (!el) return;
    if (val != null && val !== 'unsupported') {
      el.textContent = unit ? `${val} ${unit}` : val;
      el.classList.remove('detail-na');
    } else {
      el.textContent = val === 'unsupported' ? 'unsupported browser' : 'n/a';
      el.classList.add('detail-na');
    }
  };

  set('det-loss', lossPercent.toFixed(1), '%');
  set('det-pop',  pop || null);
  set('det-ttfb', fmtMs(timing.ttfb));
  set('det-dns',  fmtMs(timing.dns));
  set('det-tls',  fmtMs(timing.tls));

  // Fetch full geo info for the details grid
  fetch('/api/info').then(r => r.json()).then(data => {
    if (data) {
      set('det-asn', data.asOrganization || data.asn);
      set('det-loc', [data.city, data.country].filter(Boolean).join(', '));
    }
  }).catch(() => {});

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.effectiveType) {
    set('det-conntype', conn.effectiveType);
    set('det-downlink', conn.downlink != null ? conn.downlink : null, 'Mbps (hint)');
  } else {
    set('det-conntype', 'unsupported');
    set('det-downlink', 'unsupported');
  }

  $('details-section').classList.add('visible');
}

// ── Main test runner ──────────────────────────────────────────────────────
async function runTest() {
  btnRun.disabled    = true;
  btnRun.textContent = 'Running...';
  resetAll();

  try {
    const pingResult           = await measurePing();
    const { mbps: dlMbps, timingEntry } = await measureDownload();
    const ulMbps               = await measureUpload();

    setPhase('Test Complete', false, true);
    document.title = `${dlMbps.toFixed(1)} / ${ulMbps.toFixed(1)} Mbps — Speed — kapadia.org`;

    populateDetails({ lossPercent: pingResult.lossPercent, pop: pingResult.pop, timingEntry });
  } catch (err) {
    setPhase('error — try again', false, false);
    console.error('[speed]', err);
  } finally {
    btnRun.disabled    = false;
    btnRun.textContent = 'Run Again';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
loadIP();
btnRun.addEventListener('click', runTest);
