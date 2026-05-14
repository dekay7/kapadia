document.addEventListener('DOMContentLoaded', () => {
  const opSelect = document.getElementById('encode-operation');
  const input = document.getElementById('encode-input');
  const output = document.getElementById('encode-output');

  const addBase64Padding = (str) => {
    const pad = (4 - str.length % 4) % 4;
    return str + '='.repeat(pad);
  };

  const operations = {
    'b64-encode': (str) => {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    },
    'b64-decode': (str) => {
      const padded = addBase64Padding(str.replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0)));
    },
    'url-encode': (str) => encodeURIComponent(str),
    'url-decode': (str) => decodeURIComponent(str),
    'hex-encode': (str) => Array.from(new TextEncoder().encode(str))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
    'hex-decode': (str) => {
      const hex = str.replace(/[^a-fA-F0-9]/g, '');
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    },
    'html-encode': (str) => {
      const textarea = document.createElement('textarea');
      textarea.textContent = str;
      return textarea.innerHTML;
    },
    'html-decode': (str) => {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      return doc.body.textContent;
    }
  };

  const process = () => {
    const val = input.value;
    const op = opSelect.value;
    
    if (!val) {
      output.value = '';
      return;
    }

    try {
      output.value = operations[op](val);
    } catch (e) {
      output.value = 'Error: Invalid input for this operation.';
    }
  };

  input.addEventListener('input', process);
  opSelect.addEventListener('change', process);
});
