/**
 * EXIF Inspector — kapadia.org
 * Client-side metadata extraction and stripping. Nothing is uploaded.
 *
 * Security notes:
 *   - All metadata values set via .textContent only — never innerHTML (XSS prevention)
 *   - Object.entries() used for metadata iteration — no for..in (prototype pollution)
 *   - File type validated via magic bytes before parsing (accept attr is bypassable)
 *   - File size and count limits enforced before any processing
 *   - Object URLs revoked after use to release memory
 *   - GPS coordinates validated before building map URL
 *   - Download filename sanitized to safe characters only
 */

(function () {
  'use strict';

  const MAX_FILE_SIZE  = 50 * 1024 * 1024; // 50 MB
  const MAX_FILE_COUNT = 10;

  // ── State ────────────────────────────────────────────────────────────────────
  /** @type {Array<{file: File, meta: object|null, score: number, grade: string, error: string|null}>} */
  let files = [];
  let activeIdx = 0;

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const dropzone    = document.getElementById('exif-dropzone');
  const fileInput   = document.getElementById('exif-input');
  const errorEl     = document.getElementById('exif-error');
  const loadingEl   = document.getElementById('exif-loading');
  const loadingLbl  = document.getElementById('exif-loading-label');
  const resultsEl   = document.getElementById('exif-results');
  const fileListEl  = document.getElementById('exif-file-list');
  const detailEl    = document.getElementById('exif-detail-panel');
  const clearBtn    = document.getElementById('exif-clear-btn');

  // ── Risk metadata catalogue ───────────────────────────────────────────────────
  const RISK = {
    // GPS
    latitude:            { level: 'critical', why: 'Exact physical location where photo was taken' },
    longitude:           { level: 'critical', why: 'Exact physical location where photo was taken' },
    GPSLatitude:         { level: 'critical', why: 'Exact physical location where photo was taken' },
    GPSLongitude:        { level: 'critical', why: 'Exact physical location where photo was taken' },
    GPSAltitude:         { level: 'high',     why: 'Altitude refines physical location' },
    GPSSpeed:            { level: 'high',     why: 'Reveals movement speed at time of capture' },
    GPSImgDirection:     { level: 'medium',   why: 'Direction camera was pointing' },
    GPSDateStamp:        { level: 'high',     why: 'Exact date at GPS location' },
    GPSTimeStamp:        { level: 'high',     why: 'Exact time at GPS location' },
    // Identity
    SerialNumber:        { level: 'critical', why: 'Uniquely identifies your specific camera body' },
    LensSerialNumber:    { level: 'critical', why: 'Uniquely identifies your specific lens' },
    Artist:              { level: 'high',     why: 'Your name embedded in every photo' },
    Copyright:           { level: 'high',     why: 'Identity or organisation disclosure' },
    ImageDescription:    { level: 'medium',   why: 'May contain personal notes or descriptions' },
    UserComment:         { level: 'medium',   why: 'May contain personal notes' },
    // Device
    Make:                { level: 'high',     why: 'Camera manufacturer — narrows down your device type' },
    Model:               { level: 'high',     why: 'Exact device model — identifies your hardware' },
    Software:            { level: 'medium',   why: 'OS version or editing app version fingerprint' },
    HostComputer:        { level: 'medium',   why: 'Computer name or hostname' },
    // Time
    DateTimeOriginal:    { level: 'high',     why: 'Exact timestamp proves you were at this location' },
    DateTimeDigitized:   { level: 'medium',   why: 'Timestamp of when the image was digitized' },
    DateTime:            { level: 'medium',   why: 'Last modified timestamp' },
    // XMP / IPTC identity fields
    'xmp:creator':       { level: 'high',     why: 'Author name embedded in XMP metadata' },
    'xmp:creatortool':   { level: 'medium',   why: 'Software used to create or edit the image' },
    'iptc:credit':       { level: 'high',     why: 'Credit attribution — identifies you or your org' },
    'iptc:byline':       { level: 'high',     why: 'Photographer byline — your name' },
    'iptc:source':       { level: 'medium',   why: 'Source of the image' },
    'iptc:captionabstract': { level: 'medium', why: 'Caption may contain personal information' },
    // Low-risk technical fields (defaults)
    Orientation:         { level: 'low',      why: 'Device orientation when photo was taken' },
    FocalLength:         { level: 'low',      why: 'Camera focal length — technical data only' },
    FNumber:             { level: 'low',      why: 'Aperture setting — technical data only' },
    ISO:                 { level: 'low',      why: 'ISO sensitivity — technical data only' },
    ExposureTime:        { level: 'low',      why: 'Shutter speed — technical data only' },
    Flash:               { level: 'low',      why: 'Whether flash fired — technical data only' },
    WhiteBalance:        { level: 'low',      why: 'White balance setting — technical data only' },
    ColorSpace:          { level: 'low',      why: 'Color encoding — technical data only' },
    PixelXDimension:     { level: 'low',      why: 'Image width in pixels' },
    PixelYDimension:     { level: 'low',      why: 'Image height in pixels' },
    XResolution:         { level: 'low',      why: 'Horizontal resolution' },
    YResolution:         { level: 'low',      why: 'Vertical resolution' },
    ResolutionUnit:      { level: 'low',      why: 'Unit of resolution measurement' },
    ExposureMode:        { level: 'low',      why: 'Exposure mode — technical data only' },
    MeteringMode:        { level: 'low',      why: 'Light metering mode — technical data only' },
    SceneCaptureType:    { level: 'low',      why: 'Scene type — technical data only' },
    ExposureProgram:     { level: 'low',      why: 'Exposure program — technical data only' },
    BitsPerSample:       { level: 'low',      why: 'Bit depth — technical data only' },
    SamplesPerPixel:     { level: 'low',      why: 'Color channels — technical data only' },
    YCbCrPositioning:    { level: 'low',      why: 'Chroma positioning — technical data only' },
    Compression:         { level: 'low',      why: 'Compression type — technical data only' },
  };

  function riskFor(key) {
    const k = key.toLowerCase().replace(/[^a-z]/g, '');
    for (const [rk, rv] of Object.entries(RISK)) {
      if (rk.toLowerCase().replace(/[^a-z]/g, '') === k) return rv;
    }
    return null;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────
  function scoreMetadata(meta) {
    if (!meta || Object.keys(meta).length === 0) return { score: 100, grade: 'A', verdict: 'No metadata found', sub: 'This file contains no detectable EXIF, IPTC, or XMP metadata.' };

    let score = 100;
    const keys = Object.keys(meta).map(k => k.toLowerCase());
    const has = (k) => keys.some(key => key.includes(k.toLowerCase()));

    // GPS — biggest privacy risk
    const hasGPS = meta.latitude !== undefined || meta.longitude !== undefined ||
      meta.GPSLatitude !== undefined || meta.GPSLongitude !== undefined;
    if (hasGPS) score -= 40;

    // Device identity
    const hasSerial = has('serialnumber') || has('lensserial');
    if (hasSerial) score -= 20;

    // Author / artist fields
    const hasAuthor = has('artist') || has('copyright') || has('creator') ||
      has('byline') || has('credit');
    if (hasAuthor) score -= 15;

    // Timestamp
    if (has('datetimeoriginal')) score -= 10;

    // Device model — check exact keys to avoid matching MakerNote via 'make' substring
    const hasDeviceId = keys.some(k => k === 'make' || k === 'lensmake') || has('model');
    if (hasDeviceId) score -= 10;

    // Software fingerprint
    if (has('software') || has('creatortool')) score -= 5;

    score = Math.max(0, score);

    let grade, verdict, sub;
    if (score >= 90) {
      grade = 'A'; verdict = 'Minimal exposure'; sub = 'Few or no sensitive metadata fields detected.';
    } else if (score >= 75) {
      grade = 'B'; verdict = 'Minor exposure'; sub = 'Some metadata present but nothing highly sensitive.';
    } else if (score >= 60) {
      grade = 'C'; verdict = 'Moderate exposure'; sub = 'Identifiable metadata present — consider stripping before sharing.';
    } else if (score >= 40) {
      grade = 'D'; verdict = 'Significant exposure'; sub = 'Sensitive data detected. Strip before sharing online.';
    } else {
      grade = 'F'; verdict = 'High exposure'; sub = 'This file contains highly identifying metadata including precise location.';
    }

    return { score, grade, verdict, sub };
  }

  // ── Magic byte validation ─────────────────────────────────────────────────────
  async function detectImageType(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buf = new Uint8Array(e.target.result);
        // JPEG: FF D8 FF
        if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return resolve('image/jpeg');
        // PNG: 89 50 4E 47
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return resolve('image/png');
        // WebP: RIFF....WEBP
        if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
            buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return resolve('image/webp');
        // TIFF LE: 49 49 2A 00
        if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) return resolve('image/tiff');
        // TIFF BE: 4D 4D 00 2A
        if (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A) return resolve('image/tiff');
        // AVIF: ftyp + avif brand at bytes 8-11 (must be checked before generic HEIC ftyp)
        if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70 &&
            buf[8] === 0x61 && buf[9] === 0x76 && buf[10] === 0x69 && buf[11] === 0x66) return resolve('image/avif');
        // HEIC / HEIF: ftyp box at offset 4
        if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return resolve('image/heic');
        resolve(null); // unknown
      };
      reader.readAsArrayBuffer(file.slice(0, 12));
    });
  }

  // ── GPS utilities ─────────────────────────────────────────────────────────────
  function toDecimalDeg(val) {
    if (typeof val === 'number') return val;
    if (Array.isArray(val) && val.length === 3) {
      // DMS rational: [degrees, minutes, seconds] each as number or [num, denom]
      const toNum = (v) => Array.isArray(v) ? v[0] / (v[1] || 1) : v;
      return toNum(val[0]) + toNum(val[1]) / 60 + toNum(val[2]) / 3600;
    }
    return null;
  }

  function extractGPS(meta) {
    let lat = meta.latitude ?? (meta.GPSLatitude != null ? toDecimalDeg(meta.GPSLatitude) : null);
    let lon = meta.longitude ?? (meta.GPSLongitude != null ? toDecimalDeg(meta.GPSLongitude) : null);

    if (lat == null || lon == null) return null;
    lat = parseFloat(lat);
    lon = parseFloat(lon);

    // Apply hemisphere reference if present
    if (meta.GPSLatitudeRef === 'S' && lat > 0) lat = -lat;
    if (meta.GPSLongitudeRef === 'W' && lon > 0) lon = -lon;

    // Validate coordinate ranges
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;

    return { lat, lon };
  }

  // ── File processing ───────────────────────────────────────────────────────────
  async function processFiles(fileList) {
    clearError();

    const newFiles = Array.from(fileList).slice(0, MAX_FILE_COUNT - files.length);
    if (newFiles.length === 0) {
      showError(`Maximum ${MAX_FILE_COUNT} files allowed.`);
      return;
    }

    // Validate each file before processing
    const valid = [];
    for (const file of newFiles) {
      if (file.size > MAX_FILE_SIZE) {
        showError(`"${sanitizeName(file.name)}" exceeds the 50 MB limit and was skipped.`);
        continue;
      }
      const detected = await detectImageType(file);
      if (!detected) {
        showError(`"${sanitizeName(file.name)}" is not a recognised image format and was skipped.`);
        continue;
      }
      valid.push({ file, detectedType: detected });
    }

    if (valid.length === 0) return;

    setLoading(true, `Analyzing ${valid.length} file${valid.length > 1 ? 's' : ''}...`);
    resultsEl.classList.add('u-hidden');

    const results = await Promise.allSettled(
      valid.map(async ({ file }) => {
        try {
          const meta = await window.exifr.parse(file, {
            gps:       true,
            xmp:       true,
            iptc:      true,
            icc:       false,
            jfif:      false,
            thumbnail: false,
            // exifr returns structured objects — all values treated as text in render
          });
          const scored = scoreMetadata(meta || {});
          return { file, meta: meta || {}, ...scored, error: null };
        } catch (err) {
          return { file, meta: {}, score: 100, grade: 'A', verdict: 'Parse error', sub: err.message, error: err.message };
        }
      })
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') files.push(r.value);
      else files.push({ file: valid[0].file, meta: {}, score: 100, grade: 'A', verdict: 'Error', sub: '', error: 'Failed to process file' });
    });

    activeIdx = Math.max(0, files.length - valid.length);
    renderAll();
    setLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function renderAll() {
    renderFileList();
    renderDetail(activeIdx);
    resultsEl.classList.remove('u-hidden');
    // Move focus to the active file card so keyboard/SR users land in results
    requestAnimationFrame(() => {
      const cards = fileListEl.querySelectorAll('.exif-file-card');
      if (cards[activeIdx]) cards[activeIdx].focus();
    });
  }

  function renderFileList() {
    fileListEl.replaceChildren();
    files.forEach((entry, i) => {
      const card = document.createElement('div');
      card.className = 'exif-file-card' + (i === activeIdx ? ' active' : '');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `View metadata for ${entry.file.name}`);
      card.setAttribute('aria-pressed', String(i === activeIdx));

      const name = document.createElement('div');
      name.className = 'exif-file-name';
      // textContent prevents XSS from file.name
      name.textContent = entry.file.name;

      const meta = document.createElement('div');
      meta.className = 'exif-file-meta';
      meta.textContent = formatBytes(entry.file.size);

      const scoreRow = document.createElement('div');
      scoreRow.className = 'exif-file-score';

      const badge = makeBadgeForGrade(entry.grade);
      const scoreNum = document.createElement('span');
      scoreNum.className = 'u-mono';
      scoreNum.style.fontSize = '0.625rem';
      scoreNum.style.color = 'var(--text-faint)';
      scoreNum.textContent = `${entry.score}/100`;

      scoreRow.appendChild(badge);
      scoreRow.appendChild(scoreNum);
      card.appendChild(name);
      card.appendChild(meta);
      card.appendChild(scoreRow);

      const select = () => {
        activeIdx = i;
        renderFileList();
        renderDetail(i);
      };
      card.addEventListener('click', select);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') select(); });

      fileListEl.appendChild(card);
    });
  }

  function renderDetail(idx) {
    const entry = files[idx];
    if (!entry) return;

    detailEl.replaceChildren();

    const isHeic = entry.file.type === 'image/heic' || entry.file.type === 'image/heif' ||
      entry.file.name.toLowerCase().endsWith('.heic') || entry.file.name.toLowerCase().endsWith('.heif');

    // HEIC stripping notice
    if (isHeic) {
      const notice = document.createElement('div');
      notice.className = 'exif-heic-notice';
      notice.textContent = 'HEIC/HEIF stripping requires re-encoding. Download as JPEG to remove metadata.';
      detailEl.appendChild(notice);
    }

    // ── Score section
    const scoreSection = document.createElement('div');
    scoreSection.className = 'exif-score-section';
    scoreSection.setAttribute('aria-label', `Privacy score: ${entry.score} out of 100, Grade ${entry.grade} — ${entry.verdict}`);

    const scoreNum = document.createElement('div');
    scoreNum.className = `exif-score-number grade-${entry.grade.toLowerCase()}`;
    scoreNum.textContent = String(entry.score);

    const scoreGrade = document.createElement('div');
    scoreGrade.className = 'exif-score-grade';
    scoreGrade.textContent = entry.grade;

    const scoreInfo = document.createElement('div');
    scoreInfo.className = 'exif-score-info';

    const verdict = document.createElement('div');
    verdict.className = 'exif-score-verdict';
    verdict.textContent = entry.verdict;

    const sub = document.createElement('div');
    sub.className = 'exif-score-sub';
    sub.textContent = entry.sub;

    scoreInfo.appendChild(verdict);
    scoreInfo.appendChild(sub);
    scoreSection.appendChild(scoreNum);
    scoreSection.appendChild(scoreGrade);
    scoreSection.appendChild(scoreInfo);
    detailEl.appendChild(scoreSection);

    // ── Strip action row
    const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
    const actionRow = document.createElement('div');
    actionRow.className = 'exif-action-row';

    const actionLabel = document.createElement('div');
    actionLabel.className = 'exif-action-label';
    if (hasMeta) {
      actionLabel.textContent = 'Remove all metadata and download a clean copy.';
    } else {
      actionLabel.textContent = 'No metadata detected — this file is already clean.';
    }

    const stripBtn = document.createElement('button');
    stripBtn.className = 'exif-strip-btn';
    stripBtn.type = 'button';
    stripBtn.textContent = isHeic ? 'Strip & Convert to JPEG' : 'Strip & Download';
    if (!hasMeta && !isHeic) stripBtn.disabled = true;

    const sizeComparison = document.createElement('div');
    sizeComparison.className = 'exif-size-comparison';
    sizeComparison.textContent = `Original: ${formatBytes(entry.file.size)}`;

    stripBtn.addEventListener('click', async () => {
      stripBtn.disabled = true;
      stripBtn.setAttribute('aria-busy', 'true');
      stripBtn.textContent = 'Stripping…';
      try {
        const blob = await stripMetadata(entry.file);
        if (blob) {
          sizeComparison.textContent = `${formatBytes(entry.file.size)} → ${formatBytes(blob.size)} (stripped)`;
          // Fix extension if output format changed (e.g. HEIC→JPEG, WebP→JPEG fallback on Safari)
          let outName = 'stripped_' + sanitizeName(entry.file.name);
          const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
          const newExt = extMap[blob.type];
          if (newExt) outName = outName.replace(/\.[^.]+$/, newExt);
          downloadBlob(blob, outName);
        }
      } catch (err) {
        const ext = entry.file.name.split('.').pop().toUpperCase();
        if (err && err.code === 'DECODE_FAILED') {
          sizeComparison.textContent = `${ext} files cannot be decoded for stripping in this browser.`;
        } else {
          sizeComparison.textContent = `Strip failed: ${err && err.message ? err.message : String(err)}`;
        }
      } finally {
        stripBtn.disabled = false;
        stripBtn.removeAttribute('aria-busy');
        stripBtn.textContent = isHeic ? 'Strip & Convert to JPEG' : 'Strip & Download';
      }
    });

    actionRow.appendChild(actionLabel);
    actionRow.appendChild(stripBtn);
    actionRow.appendChild(sizeComparison);
    detailEl.appendChild(actionRow);

    // ── Metadata sections
    if (!hasMeta) {
      const noMeta = document.createElement('div');
      noMeta.className = 'exif-no-meta';
      noMeta.textContent = 'No EXIF, IPTC, or XMP metadata found in this file.';
      detailEl.appendChild(noMeta);
      return;
    }

    // Group entries by category
    const groups = groupMetadata(entry.meta);
    for (const [groupName, fields] of Object.entries(groups)) {
      if (fields.length === 0) continue;
      const cat = document.createElement('div');
      cat.className = 'exif-category';

      const header = document.createElement('div');
      header.className = 'exif-category-header';
      header.textContent = groupName;
      cat.appendChild(header);

      const block = document.createElement('div');
      block.className = 'output-block';
      const grd = document.createElement('div');
      grd.className = 'output-grid';

      for (const { key, value } of fields) {
        renderMetaRow(grd, key, value, entry.meta);
      }

      block.appendChild(grd);
      cat.appendChild(block);
      detailEl.appendChild(cat);
    }
  }

  function groupMetadata(meta) {
    const gps    = [];
    const ident  = [];
    const device = [];
    const time   = [];
    const iptc   = [];
    const xmp    = [];
    const tech   = [];
    const other  = [];

    const GPS_KEYS   = new Set(['latitude','longitude','altitude','gpslatitude','gpslongitude','gpsaltitude',
      'gpslatituderef','gpslongituderef','gpsaltituderef','gpsspeed','gpsimgdirection',
      'gpsdatestamp','gpstimestamp','gpsprocessingmethod']);
    const IDENT_KEYS = new Set(['serialnumber','lensserial','artist','copyright','imagedescription','usercomment','hostcomputer']);
    const DEVICE_KEYS= new Set(['make','model','software','lensmake','lensmodel','bodyserialnum','lensserialnumber']);
    const TIME_KEYS  = new Set(['datetimeoriginal','datetimedigitized','datetime','offsettimeoriginal','offsettime']);

    for (const [key, value] of Object.entries(meta)) {
      if (value === null || value === undefined) continue;
      const k = key.toLowerCase().replace(/[^a-z]/g, '');

      if (GPS_KEYS.has(k))    { gps.push({ key, value }); continue; }
      if (IDENT_KEYS.has(k))  { ident.push({ key, value }); continue; }
      if (DEVICE_KEYS.has(k)) { device.push({ key, value }); continue; }
      if (TIME_KEYS.has(k))   { time.push({ key, value }); continue; }
      if (key.match(/^iptc:/i) || key.match(/^credit|byline|caption|objectname|keywords/i)) { iptc.push({ key, value }); continue; }
      if (key.match(/^xmp:/i) || key.match(/^creator|creatortool|rating|subject/i)) { xmp.push({ key, value }); continue; }

      const r = riskFor(key);
      if (r && (r.level === 'low')) { tech.push({ key, value }); continue; }

      other.push({ key, value });
    }

    return {
      'GPS & Location': gps,
      'Identity': ident,
      'Device': device,
      'Timestamps': time,
      'IPTC': iptc,
      'XMP': xmp,
      'Technical': tech,
      'Other': other,
    };
  }

  function renderMetaRow(grid, key, value, fullMeta) {
    const labelEl = document.createElement('span');
    labelEl.className = 'output-label';
    // textContent — never innerHTML; key is a metadata field name, potentially attacker-controlled
    labelEl.textContent = key;

    const valueWrapper = document.createElement('span');
    valueWrapper.className = 'output-value';
    valueWrapper.style.display = 'flex';
    valueWrapper.style.alignItems = 'flex-start';
    valueWrapper.style.gap = '0.5rem';
    valueWrapper.style.flexWrap = 'wrap';

    // Special GPS rendering — shows coordinates + map link
    const isGPSCoord = key === 'latitude' || key === 'longitude' ||
      key === 'GPSLatitude' || key === 'GPSLongitude';

    if (isGPSCoord && (key === 'latitude' || key === 'GPSLatitude')) {
      const gps = extractGPS(fullMeta);
      if (gps) {
        const container = document.createElement('div');
        container.className = 'exif-val-gps';

        const coordSpan = document.createElement('span');
        // Numeric values — no injection risk
        coordSpan.textContent = `${Math.abs(gps.lat).toFixed(6)}° ${gps.lat >= 0 ? 'N' : 'S'}, ${Math.abs(gps.lon).toFixed(6)}° ${gps.lon >= 0 ? 'E' : 'W'}`;

        // Map URL built from validated finite numbers only
        const mapUrl = `https://www.openstreetmap.org/?mlat=${gps.lat.toFixed(6)}&mlon=${gps.lon.toFixed(6)}#map=15/${gps.lat.toFixed(6)}/${gps.lon.toFixed(6)}`;
        const mapLink = document.createElement('a');
        mapLink.className = 'exif-map-link';
        mapLink.href = mapUrl;
        mapLink.target = '_blank';
        mapLink.rel = 'noopener noreferrer';
        mapLink.textContent = '↗ Open in OpenStreetMap';

        container.appendChild(coordSpan);
        container.appendChild(mapLink);
        valueWrapper.appendChild(container);
      } else {
        const span = document.createElement('span');
        span.textContent = formatValue(value);
        valueWrapper.appendChild(span);
      }
    } else if (key === 'longitude' || key === 'GPSLongitude') {
      // Longitude is rendered as part of latitude row — skip standalone row
      return;
    } else {
      const span = document.createElement('span');
      // textContent — metadata value is untrusted, never use innerHTML
      span.textContent = formatValue(value);
      valueWrapper.appendChild(span);
    }

    // Risk badge
    const risk = riskFor(key);
    if (risk) {
      const badge = makeRiskBadge(risk.level);
      valueWrapper.appendChild(badge);
    }

    grid.appendChild(labelEl);
    grid.appendChild(valueWrapper);

    // Risk explanation on its own row (spans both columns via indentation)
    if (risk && risk.level !== 'low') {
      const emptyLabel = document.createElement('span');
      const expl = document.createElement('span');
      expl.style.fontSize = '0.6875rem';
      expl.style.color = 'var(--text-faint)';
      expl.style.fontFamily = 'var(--font-mono)';
      // why is a hardcoded string from RISK catalogue above — safe
      expl.textContent = risk.why;
      grid.appendChild(emptyLabel);
      grid.appendChild(expl);
    }
  }

  // ── Stripping ─────────────────────────────────────────────────────────────────
  async function stripMetadata(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw Object.assign(new Error('Image could not be decoded in this browser'), { code: 'DECODE_FAILED' });
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Object.assign(new Error('Canvas 2D context unavailable'), { code: 'CANVAS_FAILED' });
      ctx.drawImage(bitmap, 0, 0);

      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
      const preferredMime = isHeic ? 'image/jpeg'
        : file.type === 'image/png'  ? 'image/png'
        : file.type === 'image/webp' ? 'image/webp'
        : 'image/jpeg';
      const quality = preferredMime === 'image/png' ? undefined : 0.92;

      // Fall back to JPEG if browser can't encode the preferred format (e.g. WebP/AVIF on Safari)
      let blob = await new Promise((resolve) => canvas.toBlob(resolve, preferredMime, quality));
      if (!blob) blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      return blob;
    } finally {
      bitmap.close();
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revocation to allow browser to initiate the download
    setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  function setLoading(on, label) {
    if (on) {
      loadingEl.classList.remove('u-hidden');
      loadingEl.style.display = 'flex';
      if (label && loadingLbl) loadingLbl.textContent = label;
    } else {
      loadingEl.classList.add('u-hidden');
      loadingEl.style.display = 'none';
    }
  }

  function showError(text) {
    errorEl.textContent = text; // textContent — safe
    errorEl.classList.remove('u-hidden');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('u-hidden');
  }

  function makeRiskBadge(level) {
    const el = document.createElement('span');
    el.className = `risk-badge risk-${level}`;
    el.textContent = level;
    return el;
  }

  function makeBadgeForGrade(grade) {
    const levelMap = { A: 'low', B: 'low', C: 'medium', D: 'high', F: 'critical' };
    return makeRiskBadge(levelMap[grade] || 'low');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Sanitize filename to safe characters only — prevents path traversal in download attr */
  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
  }

  function formatValue(val) {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toISOString().replace('T', ' ').substring(0, 19);
    if (Array.isArray(val)) return val.map(formatValue).join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) processFiles(e.target.files);
    // Reset input so the same file can be re-added after clearing
    e.target.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files);
  });

  clearBtn.addEventListener('click', () => {
    files = [];
    activeIdx = 0;
    resultsEl.classList.add('u-hidden');
    fileListEl.replaceChildren();
    detailEl.replaceChildren();
    clearError();
  });

})();
