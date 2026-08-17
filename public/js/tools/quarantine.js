import { LIMITS, analyzeCommand } from './quarantine-core.js';

const example = 'curl -fsSL https://example.com/install.sh | sh';
const severityClass = Object.freeze({ critical: 'risk-critical', high: 'risk-high', medium: 'risk-medium', low: 'risk-low', info: 'risk-info', none: 'risk-info' });

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

const excerpt = (input, evidence) => input.slice(evidence.start, Math.min(evidence.end, evidence.start + 180));

function renderResult(input, result, results) {
  results.replaceChildren();
  const summary = element('section', undefined, 'quarantine-summary');
  summary.appendChild(element('h2', result.summary.findingCount ? `${result.summary.highestSeverity.toUpperCase()} findings detected` : 'No critical findings detected'));
  summary.appendChild(element('p', `Static analysis found ${result.summary.findingCount} finding${result.summary.findingCount === 1 ? '' : 's'} across ${result.summary.stageCount} stage${result.summary.stageCount === 1 ? '' : 's'}. This is not a safety verdict.`));
  results.appendChild(summary);

  const stages = element('section');
  stages.setAttribute('aria-label', 'Observed command stages');
  stages.appendChild(element('h2', 'Stage Map'));
  const stageList = element('ol', undefined, 'quarantine-stage-list');
  for (const stage of result.stages) {
    const item = element('li');
    item.appendChild(element('strong', stage.kind));
    item.appendChild(element('div', stage.label));
    stageList.appendChild(item);
  }
  if (!result.stages.length) stageList.appendChild(element('li', 'No executable stages were recognized.'));
  stages.appendChild(stageList);
  results.appendChild(stages);

  const findingSection = element('section');
  findingSection.setAttribute('aria-label', 'Heuristic findings');
  findingSection.appendChild(element('h2', 'Findings'));
  if (!result.findings.length) findingSection.appendChild(element('p', 'No critical findings were detected in the supported subset. Review the limitations before relying on this result.'));
  for (const finding of result.findings) {
    const card = element('article', undefined, 'quarantine-finding');
    const heading = element('h3', `${finding.ruleId}: ${finding.title}`);
    const badge = element('span', `${finding.severity} severity`, `risk-badge ${severityClass[finding.severity]}`);
    heading.appendChild(document.createTextNode(' '));
    heading.appendChild(badge);
    card.appendChild(heading);
    card.appendChild(element('p', `Confidence: ${finding.confidence}. ${finding.explanation}`, 'quarantine-meta'));
    card.appendChild(element('p', finding.explanation));
    card.appendChild(element('p', excerpt(input, finding.evidence[0]), 'quarantine-evidence'));
    const guidance = element('ul', undefined, 'quarantine-guidance');
    for (const item of finding.guidance) guidance.appendChild(element('li', item));
    card.appendChild(guidance);
    findingSection.appendChild(card);
  }
  results.appendChild(findingSection);

  const limits = element('section', undefined, 'quarantine-limitations');
  limits.appendChild(element('h2', 'Limitations'));
  const list = element('ul');
  for (const limitation of result.limitations) list.appendChild(element('li', limitation));
  limits.appendChild(list);
  results.appendChild(limits);

  const copyButton = element('button', 'Copy Report (No Command Text)', 'btn btn-secondary quarantine-copy');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    const report = result.findings.map((finding) => `${finding.ruleId} | ${finding.severity} | ${finding.title}`).join('\n');
    try {
      await navigator.clipboard.writeText(`Command Quarantine report\n${report || 'No findings.'}\n\nLimitations:\n${result.limitations.join('\n')}`);
      copyButton.textContent = 'Report Copied';
    } catch {
      copyButton.textContent = 'Copy Unavailable';
    }
  });
  results.appendChild(copyButton);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('quarantine-input');
  const count = document.getElementById('quarantine-count');
  const analyze = document.getElementById('quarantine-analyze');
  const clear = document.getElementById('quarantine-clear');
  const loadExample = document.getElementById('quarantine-example');
  const status = document.getElementById('quarantine-status');
  const results = document.getElementById('quarantine-results');
  const updateCount = () => { count.textContent = `(${input.value.length} / ${LIMITS.maxInputChars / 1024} KiB)`; };
  const run = () => {
    analyze.setAttribute('aria-busy', 'true');
    const result = analyzeCommand(input.value);
    renderResult(input.value, result, results);
    results.classList.remove('u-hidden');
    status.textContent = result.truncated ? 'Analysis completed with configured limits applied.' : 'Analysis completed locally. No command was run.';
    analyze.removeAttribute('aria-busy');
    requestAnimationFrame(() => results.focus());
  };
  input.addEventListener('input', updateCount);
  analyze.addEventListener('click', run);
  clear.addEventListener('click', () => { input.value = ''; updateCount(); results.replaceChildren(); results.classList.add('u-hidden'); status.textContent = 'Input cleared from this tab.'; input.focus(); });
  loadExample.addEventListener('click', () => { input.value = example; updateCount(); status.textContent = 'Inert example loaded; it has not been executed.'; input.focus(); });
  updateCount();
});
