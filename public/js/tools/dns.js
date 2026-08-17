document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('dns-input');
  const btn = document.getElementById('dns-btn');
  const loading = document.getElementById('dns-loading');
  const errorEl = document.getElementById('dns-error');
  const resultsContainer = document.getElementById('dns-results');
  const recordsContainer = document.getElementById('dns-records-container');

  // Build a single record type block using DOM methods (no innerHTML)
  function buildTypeBlock(type, records) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dns-type-block';

    const header = document.createElement('div');
    header.className = 'dns-type-label';
    header.textContent = `${type} Records`;
    wrapper.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'output-grid dns-records-grid';
    wrapper.appendChild(grid);

    records.forEach(record => {
      const ttlEl = document.createElement('span');
      ttlEl.className = 'output-label';
      ttlEl.textContent = `TTL ${record.ttl}`;

      const valEl = document.createElement('span');
      valEl.className = 'output-value';

      // Highlight SPF / DMARC records with a class instead of an inline style
      if (type === 'TXT' && (record.data.includes('v=spf1') || record.data.includes('v=DMARC1'))) {
        valEl.classList.add('dns-highlight');
      }

      valEl.textContent = record.data;

      grid.appendChild(ttlEl);
      grid.appendChild(valEl);
    });

    return wrapper;
  }

  let inflight = false;

  const lookup = async () => {
    if (inflight) return;
    const domain = input.value.trim();
    if (!domain) return;

    // Reset UI
    inflight = true;
    loading.style.display = 'block';
    errorEl.style.display = 'none';
    resultsContainer.style.display = 'none';
    recordsContainer.replaceChildren();
    btn.disabled = true;

    try {
      const res = await fetch(`/api/dns?domain=${encodeURIComponent(domain)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `API returned ${res.status}`);
      }

      const data = await res.json();

      const order = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'];
      let foundAny = false;

      order.forEach(type => {
        if (data[type] && data[type].length > 0) {
          foundAny = true;
          recordsContainer.appendChild(buildTypeBlock(type, data[type]));
        }
      });

      if (!foundAny) {
        const empty = document.createElement('div');
        empty.className = 'output-text';
        empty.textContent = 'No standard records found for this domain.';
        recordsContainer.appendChild(empty);
      }

      resultsContainer.style.display = 'block';

    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || 'Failed to lookup domain. Ensure it is a valid domain name.';
      errorEl.style.display = 'block';
    } finally {
      inflight = false;
      loading.style.display = 'none';
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', lookup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookup();
  });
});
