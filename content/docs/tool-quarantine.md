---
title: Command Quarantine
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 30
tool_desc: Explain risky shell commands before you run them.
tool_suffix: No data sent.
---

# Command Quarantine

> [!NOTE]
> Command Quarantine runs entirely in your browser. Pasted commands are never executed, transmitted, stored, or fetched. They remain in the current tab only.

Command Quarantine provides a bounded static analysis of POSIX-style shell snippets. It maps recognizable command stages and highlights heuristic data-flow and execution hazards before you decide whether to run something. It never gives a safe verdict.

## Supported Shell Subset

The analyzer recognizes common `sh` and `bash`-style words, quotes, escapes, comments, pipes, sequences, conditionals, redirects, substitutions, and simple subshell markers. It does not execute or emulate text, expand variables, resolve aliases, evaluate heredocs, or model the local runtime environment.

PowerShell, CMD, Fish, Nushell, and language-specific scripts are outside scope. Use a parser built for those languages instead.

## Findings

| Rule | Meaning |
|---|---|
| CQ001 | Remote response directly flows into a shell or interpreter. |
| CQ002 | Dynamic execution is requested through `eval`, `source`, or an interpreter `-c` form. |
| CQ003 | Privilege elevation is requested. |
| CQ004 | A decode, decrypt, or extraction transform visibly feeds execution. |
| CQ005 | A scheduled task, service, or startup location is modified. |
| CQ006 | A credential-sensitive path is referenced. |
| CQ007 | A broad destructive deletion target is visible. |
| CQ008 | Sensitive local data may be uploaded over the network. |
| CQ009 | A remote executable artifact appears mutable or unpinned. |
| CQ010 | Certificate verification is disabled before executable retrieval. |
| CQ011 | Plain HTTP retrieves executable content. |
| CQ012 | Integrity verification is not visible in a direct remote-execution chain. |
| CQ013 | A shell startup file is written or appended. |
| CQ014 | Concealment or unsupported syntax reduces static-analysis confidence. |

## How to Interpret Results

A finding is evidence to inspect, not proof of malicious intent. For example, a bootstrap installer may legitimately use `curl | sh`, but it still bypasses a chance to review the downloaded program before execution. Download to a file, inspect it, verify a published signature or checksum, and only then decide whether to run it.

A missing finding is not proof that a command is harmless. Shell behavior can depend on variables, aliases, functions, remote content, filesystem state, and tools the analyzer cannot see.

## Privacy and Threat Model

Pasted commands can contain tokens, signed URLs, hostnames, usernames, and file paths. The trust boundary is the textarea: all output is rendered as inert text with safe DOM APIs. The tool has no Worker endpoint, network request, analytics, browser storage, history, or automatic clipboard behavior. The explicit report-copy button deliberately excludes the raw command.

Input is capped at 32 KiB and token processing at 4,096 tokens. These limits prevent a very large paste from consuming unbounded browser work. Malformed and unsupported input produces limitations rather than execution or a guessed safety claim.

## Examples

`curl -fsSL https://example.com/install.sh | sh` shows a remote-to-interpreter flow. `curl -fsSL https://example.com/install.sh -o install.sh` does not produce the direct-execution finding because the visible snippet downloads without executing. It still deserves manual review.

## Known Limitations

Static analysis cannot prove intent. It can produce false positives when a suspicious path or URL is benign, and false negatives when behavior is hidden behind variable expansion, aliases, functions, encodings, or remote responses. Treat the stage map and confidence labels as inspection aids, never a security guarantee.
