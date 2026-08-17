export const LIMITS = Object.freeze({ maxInputChars: 32768, maxTokens: 4096 });

const SEVERITY_RANK = Object.freeze({ critical: 5, high: 4, medium: 3, low: 2, info: 1, none: 0 });
const NETWORK = new Set(['curl', 'wget', 'fetch', 'nc', 'netcat']);
const INTERPRETERS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'python', 'perl', 'ruby']);
const TRANSFORMS = new Set(['base64', 'openssl', 'gzip', 'gunzip', 'xz', 'tar', 'unzip']);

export function tokenizeShell(source) {
  const input = typeof source === 'string' ? source.slice(0, LIMITS.maxInputChars) : '';
  const tokens = [];
  let index = 0;
  let start = 0;
  let word = '';
  let quote = '';
  let escaped = false;
  const pushWord = () => {
    if (word) tokens.push({ type: 'word', value: word, start, end: index });
    word = '';
  };
  const pushOperator = (value) => {
    pushWord();
    tokens.push({ type: 'operator', value, start: index, end: index + value.length });
    index += value.length;
    start = index;
  };
  while (index < input.length && tokens.length < LIMITS.maxTokens) {
    const character = input[index];
    if (escaped) { word += character; escaped = false; index += 1; continue; }
    if (character === '\\' && quote !== "'") { if (!word) start = index; word += character; escaped = true; index += 1; continue; }
    if (quote) { word += character; if (character === quote) quote = ''; index += 1; continue; }
    if (character === '"' || character === "'") { if (!word) start = index; word += character; quote = character; index += 1; continue; }
    if (character === '#') { pushWord(); while (index < input.length && input[index] !== '\n') index += 1; start = index; continue; }
    if (/\s/.test(character)) { pushWord(); if (character === '\n') tokens.push({ type: 'operator', value: ';', start: index, end: index + 1 }); index += 1; start = index; continue; }
    const pair = input.slice(index, index + 2);
    if (['&&', '||', '>>', '<<', ';;'].includes(pair)) { pushOperator(pair); continue; }
    if ('|;()<>&'.includes(character)) { pushOperator(character); continue; }
    if (!word) start = index;
    word += character;
    index += 1;
  }
  pushWord();
  return tokens;
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function executableName(command) {
  const word = command.words.find((item) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(item)) || '';
  return word.slice(word.lastIndexOf('/') + 1);
}

function commandKind(command) {
  const name = executableName(command);
  if (NETWORK.has(name)) return 'network';
  if (INTERPRETERS.has(name)) return 'interpreter';
  if (name === 'sudo' || name === 'doas' || name === 'su') return 'privilege';
  if (TRANSFORMS.has(name)) return 'transform';
  if (name === 'cat' || name === 'read') return 'read';
  if (['echo', 'printf', 'tee'].includes(name) || command.redirects.length) return 'write';
  return name ? 'execute' : 'unknown';
}

export function parseShellStructure(tokens) {
  const commands = [];
  const edges = [];
  let words = [];
  let evidence = [];
  let redirects = [];
  let pendingEdge = null;
  const finish = () => {
    if (!words.length) return;
    const command = { words, evidence, redirects, start: evidence[0].start, end: evidence.at(-1).end };
    command.kind = commandKind(command);
    commands.push(command);
    if (pendingEdge && commands.length > 1) {
      edges.push({ from: `stage-${commands.length - 1}`, to: `stage-${commands.length}`, kind: pendingEdge });
      pendingEdge = null;
    }
    words = []; evidence = []; redirects = [];
  };
  for (const token of tokens) {
    if (token.type === 'word') { words.push(unquote(token.value)); evidence.push(token); continue; }
    if (['>', '>>', '<', '<<'].includes(token.value)) { redirects.push(token); continue; }
    if (['|', ';', '&&', '||'].includes(token.value)) {
      finish();
      pendingEdge = token.value === '|' ? 'pipe' : token.value === ';' ? 'sequence' : 'conditional';
    }
  }
  finish();
  const stages = commands.map((command, index) => ({ id: `stage-${index + 1}`, kind: command.kind, label: command.words.slice(0, 2).join(' ') || 'unknown command', command: command.words[0] || '', evidence: { start: command.start, end: command.end } }));
  return { commands, stages, edges };
}

function has(words, value) { return words.includes(value); }
function includesText(command, fragment) { return command.words.some((word) => word.toLowerCase().includes(fragment)); }
function isNetwork(command) { return NETWORK.has(executableName(command)); }
function isInterpreter(command) { return INTERPRETERS.has(executableName(command)); }
function isInterpreterSink(command) {
  if (isInterpreter(command)) return true;
  const name = executableName(command);
  if (!['sudo', 'doas'].includes(name)) return false;
  const wrapperIndex = command.words.findIndex((word) => word === name || word.endsWith(`/${name}`));
  const target = command.words.slice(wrapperIndex + 1).find((word) => !word.startsWith('-')) || '';
  return INTERPRETERS.has(target.slice(target.lastIndexOf('/') + 1));
}
function isSensitivePath(command) { return command.words.some((word) => /(?:\.ssh|\.aws|\.config\/gcloud|\.npmrc|\.pypirc|\.bash_history|\.zsh_history|credentials)/.test(word)); }
function isProfilePath(command) { return command.words.some((word) => /(?:\.bashrc|\.zshrc|\.profile|\.bash_profile|\.config\/autostart)/.test(word)); }
function evidenceFor(command, label) { return [{ start: command.start, end: command.end, label }]; }

function finding(ruleId, severity, confidence, title, explanation, command, guidance) {
  return { ruleId, severity, confidence, title, explanation, evidence: evidenceFor(command, title.toLowerCase()), guidance };
}

export function analyzeCommand(source) {
  const input = typeof source === 'string' ? source : '';
  const tooLong = input.length > LIMITS.maxInputChars;
  const tokens = tokenizeShell(input);
  const tokenLimited = tokens.length >= LIMITS.maxTokens && input.length > 0;
  const structure = parseShellStructure(tokens);
  const findings = [];
  const add = (entry) => { if (!findings.some((item) => item.ruleId === entry.ruleId && item.evidence[0].start === entry.evidence[0].start)) findings.push(entry); };
  const commands = structure.commands;
  const pipes = structure.edges.filter((edge) => edge.kind === 'pipe');
  const pipePairs = pipes.map((edge) => [commands[Number(edge.from.slice(6)) - 1], commands[Number(edge.to.slice(6)) - 1]]);
  const remoteExecution = pipePairs.filter(([left, right]) => isNetwork(left) && isInterpreterSink(right));

  for (const [left, right] of remoteExecution) {
    add(finding('CQ001', 'critical', 'high', 'Remote content flows directly into an interpreter', 'A visible pipeline sends a remote response directly to a shell or interpreter.', left, ['Download the artifact to a file first.', 'Inspect and verify it before execution.']));
    const insecure = has(left.words, '-k') || has(left.words, '--insecure') || has(left.words, '--no-check-certificate');
    const http = left.words.some((word) => word.startsWith('http://'));
    const pinned = left.words.some((word) => /(?:sha256|sha512|@[0-9a-f]{7,})/i.test(word));
    if (insecure) add(finding('CQ010', 'high', 'high', 'Transport verification is disabled', 'The retrieval command visibly disables certificate verification before execution.', left, ['Remove the insecure transport option.', 'Use normal certificate validation.']));
    if (http) add(finding('CQ011', 'high', 'high', 'Plain HTTP retrieves executable content', 'Visible executable content is retrieved over unencrypted HTTP.', left, ['Use HTTPS with certificate verification.', 'Verify a pinned artifact before execution.']));
    if (!pinned) add(finding('CQ009', 'medium', 'low', 'Remote artifact appears mutable or unpinned', 'The visible URL does not show a versioned or immutable artifact reference.', left, ['Prefer a versioned release and verified checksum.']));
    add(finding('CQ012', 'medium', 'medium', 'Integrity verification is not visible', 'No checksum verification is visible in this direct remote-execution chain.', left, ['Download first, then validate a published checksum or signature.']));
  }
  for (const [left, right] of pipePairs) {
    const uploadOption = has(right.words, '--upload-file') || has(right.words, '-T') || has(right.words, '--data') || has(right.words, '-d') || has(right.words, '-F') || has(right.words, '--form') || right.words.some((word) => word.includes('=@'));
    if (isSensitivePath(left) && isNetwork(right) && uploadOption) add(finding('CQ008', 'high', 'medium', 'Sensitive local data may be uploaded', 'A credential-sensitive source visibly feeds a network command with an upload or body option.', left, ['Remove the upload option.', 'Verify the destination and data classification before sending anything.']));
  }

  for (const command of commands) {
    const words = command.words;
    const name = executableName(command);
    const nameIndex = words.findIndex((word) => word === name || word.endsWith(`/${name}`));
    const wrappedInterpreter = ['sudo', 'doas'].includes(name) && INTERPRETERS.has(words[nameIndex + 1]) && has(words, '-c');
    const dynamic = name === 'eval' || (INTERPRETERS.has(name) && has(words, '-c')) || wrappedInterpreter || name === 'source' || name === '.';
    if (dynamic) add(finding('CQ002', 'high', 'high', 'Dynamic execution is requested', 'The command asks a shell or interpreter to evaluate constructed text.', command, ['Replace dynamic evaluation with an inspected file or explicit arguments.']));
    if (wrappedInterpreter && words.some((word) => word.includes('curl ') || word.includes('wget ')) && words.some((word) => word.includes('| sh') || word.includes('| bash'))) add(finding('CQ001', 'critical', 'medium', 'Remote content flows directly into an interpreter', 'Nested shell text visibly combines a remote retrieval command and an interpreter pipeline.', command, ['Download the artifact to a file first.', 'Inspect and verify it before execution.']));
    if (['sudo', 'doas', 'su'].includes(name)) add(finding('CQ003', remoteExecution.length ? 'high' : 'medium', 'high', 'Privilege elevation is requested', 'This command requests elevated privileges; review its complete effect first.', command, ['Remove elevation unless it is necessary.', 'Inspect the exact command as an unprivileged user first.']));
    if (TRANSFORMS.has(name) && (has(words, '-d') || has(words, '--decode') || includesText(command, 'enc'))) {
      const flowsToInterpreter = pipePairs.some(([left, right]) => left === command && isInterpreter(right));
      if (flowsToInterpreter) add(finding('CQ004', 'high', 'medium', 'Decoded content may be executed', 'A decode or decrypt transform directly feeds an interpreter in the visible pipeline.', command, ['Decode to a file and inspect it before execution.']));
    }
    const modifiesSchedule = name === 'crontab' && !has(words, '-l');
    const modifiesService = name === 'systemctl' && (has(words, 'enable') || has(words, 'link'));
    const modifiesProfile = isProfilePath(command) && command.redirects.some((redirect) => redirect.value === '>' || redirect.value === '>>');
    if (modifiesSchedule || modifiesService || modifiesProfile) add(finding('CQ005', 'high', 'medium', 'Persistence mechanism is modified', 'The snippet visibly changes a scheduled task, service, or startup location.', command, ['Inspect the exact file or unit being changed.', 'Use a reversible, documented configuration change.']));
    if (isSensitivePath(command)) add(finding('CQ006', 'high', 'medium', 'Credential-sensitive path is referenced', 'The snippet references a path commonly used for credentials or secrets.', command, ['Confirm the path is intended.', 'Do not upload or expose its contents.']));
    if (name === 'rm' && (has(words, '-rf') || (has(words, '-r') && has(words, '-f'))) && words.some((word) => ['/', '~', '$HOME'].includes(word))) add(finding('CQ007', 'critical', 'high', 'Broad destructive deletion is requested', 'Recursive forced deletion targets a root or home-level location.', command, ['Stop and inspect the expanded target.', 'Use a narrow, explicit path and a dry-run where available.']));
    if (isNetwork(command) && (has(words, '--upload-file') || has(words, '-T') || has(words, '-F') || has(words, '--form') || words.some((word) => word.startsWith('@') || word.includes('=@')))) {
      if (isSensitivePath(command)) add(finding('CQ008', 'high', 'high', 'Sensitive local data may be uploaded', 'A network upload option is paired with a credential-sensitive path.', command, ['Remove the upload option.', 'Verify the destination and data classification before sending anything.']));
    }
    if (isProfilePath(command) && command.redirects.some((redirect) => redirect.value === '>' || redirect.value === '>>')) add(finding('CQ013', 'medium', 'high', 'Shell startup file is changed', 'A visible redirect writes to a shell profile or startup file.', command, ['Inspect the full startup-file diff.', 'Keep changes reversible and documented.']));
    if (words.some((word) => word.includes('$(') || word.includes('`')) || (INTERPRETERS.has(name) && has(words, '-c')) || words.some((word) => word.length > 512 && /^[A-Za-z0-9+/=]+$/.test(word))) add(finding('CQ014', 'medium', 'medium', 'Concealment reduces static-analysis confidence', 'Substitution, nested interpretation, or a long encoded literal can hide runtime behavior.', command, ['Expand and inspect the constructed text without executing it.']));
  }

  if (input.includes('Get-') || input.includes('Invoke-') || input.includes('$env:')) {
    findings.push({ ruleId: 'CQ014', severity: 'info', confidence: 'low', title: 'Unsupported shell syntax detected', explanation: 'This tool analyzes POSIX-style shell only; PowerShell syntax is not modeled.', evidence: [{ start: 0, end: Math.min(input.length, 64), label: 'unsupported syntax' }], guidance: ['Use a PowerShell-specific parser for a reliable assessment.'] });
  }
  const limitations = ['Static analysis does not execute commands, expand variables, resolve aliases, or prove intent.', 'This tool never calls a command safe; false positives and false negatives are possible.'];
  if (tooLong) limitations.push(`Input exceeded the ${LIMITS.maxInputChars.toLocaleString()} character limit and was truncated before analysis.`);
  if (tokenLimited) limitations.push(`Token processing stopped at the ${LIMITS.maxTokens.toLocaleString()} token limit.`);
  if (input.includes('Get-') || input.includes('Invoke-') || input.includes('$env:')) limitations.push('PowerShell-like syntax is outside the supported POSIX shell subset.');
  if (!input.trim()) limitations.push('Enter a POSIX-style shell snippet to receive heuristic findings.');
  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.evidence[0].start - b.evidence[0].start || a.ruleId.localeCompare(b.ruleId));
  const highestSeverity = findings[0]?.severity || 'none';
  return { version: 1, language: 'posix-shell', summary: { highestSeverity, findingCount: findings.length, statementCount: commands.length, stageCount: structure.stages.length }, stages: structure.stages, edges: structure.edges, findings, limitations, truncated: tooLong || tokenLimited };
}
