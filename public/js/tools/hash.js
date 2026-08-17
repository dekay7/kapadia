document.addEventListener('DOMContentLoaded', () => {
  const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

  const inputText = document.getElementById('hash-input-text');
  const dropZone = document.getElementById('hash-drop-zone');
  const fileInput = document.getElementById('hash-file-input');
  const fileInfo = document.getElementById('hash-file-info');
  const fileNameDisplay = document.getElementById('hash-file-name');
  const clearFileBtn = document.getElementById('hash-clear-file');
  const compareInput = document.getElementById('hash-compare');

  const outMd5 = document.getElementById('out-md5');
  const outSha1 = document.getElementById('out-sha1');
  const outSha256 = document.getElementById('out-sha256');
  const outSha512 = document.getElementById('out-sha512');

  let currentFile = null;

  // Helpers
  const buf2hex = (buffer) =>
    Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
  }

  const clearOutputs = () => {
    outMd5.textContent = '...';
    outSha1.textContent = '...';
    outSha256.textContent = '...';
    outSha512.textContent = '...';
    checkCompare();
  };

  const checkCompare = () => {
    const expected = compareInput.value.trim().toLowerCase();
    const els = [outMd5, outSha1, outSha256, outSha512];
    
    els.forEach(el => {
      el.classList.remove('match-success', 'match-fail');
      if (expected && el.textContent !== '...' && el.textContent !== 'Error' && el.textContent !== 'Processing...') {
        if (el.textContent === expected) {
          el.classList.add('match-success');
        } else {
          el.classList.add('match-fail');
        }
      }
    });
  };

  const calculateTextHashes = async (text) => {
    if (!text) {
      clearOutputs();
      return;
    }

    outMd5.textContent = SparkMD5.hash(text);

    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    try {
      const [hash1, hash256, hash512] = await Promise.all([
        crypto.subtle.digest('SHA-1', data),
        crypto.subtle.digest('SHA-256', data),
        crypto.subtle.digest('SHA-512', data),
      ]);
      outSha1.textContent = buf2hex(hash1);
      outSha256.textContent = buf2hex(hash256);
      outSha512.textContent = buf2hex(hash512);
      checkCompare();
    } catch {
      outSha1.textContent = 'Error';
      outSha256.textContent = 'Error';
      outSha512.textContent = 'Error';
    }
  };

  const calculateFileHashes = (file) => {
    outMd5.textContent = 'Processing...';
    outSha1.textContent = 'Processing...';
    outSha256.textContent = 'Processing...';
    outSha512.textContent = 'Processing...';
    fileInfo.setAttribute('aria-busy', 'true');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target.result;
      outMd5.textContent = SparkMD5.ArrayBuffer.hash(buffer);
      try {
        const [hash1, hash256, hash512] = await Promise.all([
          crypto.subtle.digest('SHA-1', buffer),
          crypto.subtle.digest('SHA-256', buffer),
          crypto.subtle.digest('SHA-512', buffer),
        ]);
        outSha1.textContent = buf2hex(hash1);
        outSha256.textContent = buf2hex(hash256);
        outSha512.textContent = buf2hex(hash512);
        checkCompare();
      } catch {
        outSha1.textContent = 'Error';
        outSha256.textContent = 'Error';
        outSha512.textContent = 'Error';
      } finally {
        fileInfo.removeAttribute('aria-busy');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Event Listeners
  inputText.addEventListener('input', (e) => {
    if (currentFile) {
      clearFile();
    }
    calculateTextHashes(e.target.value);
  });

  compareInput.addEventListener('input', checkCompare);

  // File handling
  const handleFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      outMd5.textContent = 'File too large (max 2 GB)';
      outSha1.textContent = 'File too large (max 2 GB)';
      outSha256.textContent = 'File too large (max 2 GB)';
      outSha512.textContent = 'File too large (max 2 GB)';
      return;
    }
    currentFile = file;
    inputText.value = ''; // clear text
    dropZone.classList.add('u-hidden');
    fileInfo.classList.remove('u-hidden');
    fileNameDisplay.textContent = `${sanitizeName(file.name)} (${(file.size / 1024).toFixed(2)} KB)`;
    calculateFileHashes(file);
  };

  const clearFile = () => {
    currentFile = null;
    fileInput.value = '';
    dropZone.classList.remove('u-hidden');
    fileInfo.classList.add('u-hidden');
    clearOutputs();
  };

  clearFileBtn.addEventListener('click', clearFile);

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  // Drag and drop events
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) handleFile(files[0]);
  }, false);

});
