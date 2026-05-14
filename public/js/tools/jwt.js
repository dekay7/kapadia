document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('jwt-input');
  const outHeader = document.getElementById('jwt-out-header');
  const outPayload = document.getElementById('jwt-out-payload');
  const outSig = document.getElementById('jwt-out-sig');

  const decodeBase64Url = (str) => {
    try {
      const pad = (4 - str.length % 4) % 4;
      const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
      const decoded = atob(padded);
      // Try parsing as JSON to format it
      return JSON.stringify(JSON.parse(decoded), null, 2);
    } catch (e) {
      return 'Invalid Base64 or JSON';
    }
  };

  input.addEventListener('input', (e) => {
    const token = e.target.value.trim();
    if (!token) {
      outHeader.textContent = '{}';
      outPayload.textContent = '{}';
      outSig.textContent = '...';
      return;
    }

    const parts = token.split('.');
    
    if (parts.length > 0 && parts[0]) {
      outHeader.textContent = decodeBase64Url(parts[0]);
    } else {
      outHeader.textContent = '{}';
    }

    if (parts.length > 1 && parts[1]) {
      outPayload.textContent = decodeBase64Url(parts[1]);
    } else {
      outPayload.textContent = '{}';
    }

    if (parts.length > 2 && parts[2]) {
      outSig.textContent = parts[2];
    } else {
      outSig.textContent = '...';
    }
  });
});
