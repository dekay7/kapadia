import { toolsMeta } from '/js/tools-meta.js';

const grid = document.getElementById('tools-grid');
for (const tool of toolsMeta) {
  const a = document.createElement('a');
  a.href = `/tools/${tool.slug}/`;
  a.className = 'tool-card';

  const icon = document.createElement('span');
  icon.className = 'tool-icon';
  icon.textContent = `~/${tool.slug}`;

  const h2 = document.createElement('h2');
  h2.className = 'tool-title';
  h2.textContent = tool.title;

  const p = document.createElement('p');
  p.className = 'tool-desc';
  p.textContent = tool.suffix ? `${tool.desc} ${tool.suffix}` : tool.desc;

  a.append(icon, h2, p);
  grid.appendChild(a);
}
