document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('leak-loading');
  const results = document.getElementById('leak-results');
  
  const netGrid = document.getElementById('leak-net-grid');
  const headersGrid = document.getElementById('leak-headers-grid');
  const clientGrid = document.getElementById('leak-client-grid');

  const addRow = (grid, label, value) => {
    const labelEl = document.createElement('span');
    labelEl.className = 'output-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'output-value';
    
    if (value === null || value === undefined) {
      valueEl.textContent = 'null';
      valueEl.classList.add('output-value--null');
    } else {
      valueEl.textContent = value;
    }

    grid.appendChild(labelEl);
    grid.appendChild(valueEl);
  };

  try {
    const res = await fetch('/api/leak');
    const data = await res.json();

    // Server Network Info
    addRow(netGrid, 'IP Address', data.ip);
    addRow(netGrid, 'HTTP Protocol', data.httpProtocol);
    addRow(netGrid, 'TLS Version', data.tlsVersion);
    addRow(netGrid, 'TLS Cipher', data.tlsCipher);
    addRow(netGrid, 'TCP RTT (ms)', data.clientTcpRtt);
    addRow(netGrid, 'Edge Center', data.colo);

    // HTTP Headers
    const skipHeaders = ['cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-real-ip'];
    for (const [key, val] of Object.entries(data.headers)) {
      if (!skipHeaders.includes(key)) {
        addRow(headersGrid, key, val);
      }
    }

    // Client Side Details
    addRow(clientGrid, 'User Agent', navigator.userAgent);
    addRow(clientGrid, 'Platform', navigator.platform || (navigator.userAgentData ? navigator.userAgentData.platform : 'Unknown'));
    addRow(clientGrid, 'Language', navigator.language);
    addRow(clientGrid, 'Languages', navigator.languages ? navigator.languages.join(', ') : 'Unknown');
    addRow(clientGrid, 'Screen Resolution', `${window.screen.width}x${window.screen.height}`);
    addRow(clientGrid, 'Window Size', `${window.innerWidth}x${window.innerHeight}`);
    addRow(clientGrid, 'Color Depth', window.screen.colorDepth ? `${window.screen.colorDepth}-bit` : 'Unknown');
    addRow(clientGrid, 'Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    addRow(clientGrid, 'Timezone Offset', `${-(new Date().getTimezoneOffset() / 60)} hours`);
    addRow(clientGrid, 'Do Not Track', navigator.doNotTrack || window.doNotTrack || 'Unspecified');
    addRow(clientGrid, 'Hardware Concurrency', navigator.hardwareConcurrency || 'Unknown');
    addRow(clientGrid, 'Device Memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown');
    addRow(clientGrid, 'Cookies Enabled', navigator.cookieEnabled);
    addRow(clientGrid, 'PDF Viewer Enabled', navigator.pdfViewerEnabled);

    // WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) {
          addRow(clientGrid, 'WebGL Vendor', 'Not Available');
          addRow(clientGrid, 'WebGL Renderer', 'Not Available');
        } else {
          addRow(clientGrid, 'WebGL Vendor', gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
          addRow(clientGrid, 'WebGL Renderer', gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        }
      } else {
        addRow(clientGrid, 'WebGL', 'Not Supported');
      }
    } catch (e) {
      addRow(clientGrid, 'WebGL', 'Error retrieving');
    }

    results.style.display = 'block';

  } catch (err) {
    console.error(err);
    const errEl = document.createElement('div');
    errEl.className = 'leak-error';
    errEl.textContent = 'Failed to fetch server data.';
    netGrid.appendChild(errEl);
    results.style.display = 'block';
  } finally {
    loading.style.display = 'none';
  }
});
