# Real-agent smoke checklist

Run this checklist when a supported agent CLI reaches a new major version or its headless flags
change.

```sh
pnpm test:agents -- claude
```

Replace `claude` with `codex`, `cursor`, `gemini`, `grok`, or `opencode`. The script skips the run
when it cannot find the selected CLI. An installed CLI must finish without manual input and print
these results:

- `PASS doctor convergence`
- `PASS doctor second run`
- `PASS fix convergence`

For each agent, also verify these cases manually and record the date and version in ADR 0003:

- A timed-out attempt stops the full process group, reassesses, and reports remaining items.
- Ctrl-C stops the agent, reassesses once, reports remaining items, and exits 1.
- Codex and Cursor print the unscoped-agent warning.
- Claude Code, Gemini CLI, Grok Build, and OpenCode reject shell commands outside the Doctor
  allowlist. Fix and Analyze permit no shell command.
- Doctor exits 0 after convergence, and its next run reports no findings.
