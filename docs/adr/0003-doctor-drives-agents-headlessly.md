# Doctor drives agents headlessly

Date: 2026-09-16

## Decision

Adamantite drives supported coding agents as headless child processes. Doctor, `fix --agent`, and
`analyze --agent` use one repair loop. The loop writes the current work items to a temporary file,
runs an agent with a short prompt, reruns the owning detector, and retries with the items that
remain. A failed or timed-out attempt still receives credit for repairs that verification confirms.

Doctor remains an assessment command. It does not contain repair transformations and it does not
write target-project files. The coding agent performs edits. `assessProject` decides whether the
project reached the managed state.

Each attempt has a permission profile. Doctor allows file tools and command prefixes for Doctor and
Update through the supported package runners. It also permits exact `rm <path>` commands for legacy
configuration files named by findings. Fix and Analyze allow file tools only. Codex cannot enforce
the command list beyond its workspace-write sandbox. Cursor runs with `--force` and cannot enforce
the profile. Adamantite warns before it starts either agent.

The CLI contract table is kept in code and tested as exact arguments and environment variables.
Adamantite documents a minimum version but does not parse version output at runtime.

| Agent       | Minimum version | Profile enforcement            | Provenance                                    |
| ----------- | --------------- | ------------------------------ | --------------------------------------------- |
| Claude Code | 2.1.272         | File tools and shell allowlist | Verified locally 2026-09-16                   |
| Codex       | 0.154.0         | Workspace sandbox only         | Verified locally 2026-09-16                   |
| Cursor      | 2026.09         | None                           | First-party documentation, smoke test pending |
| Gemini CLI  | 0.8.0           | File tools and shell allowlist | First-party documentation, smoke test pending |
| Grok Build  | 1.0.30          | File tools and shell allowlist | Verified locally 2026-09-16                   |
| OpenCode    | 1.18.31         | File tools and shell allowlist | Verified locally 2026-09-16                   |

Doctor treats the project as one work unit, allows three ten-minute attempts, and verifies by finding
ID. Fix works on one file at a time, allows three five-minute attempts, and verifies with Oxlint and
Oxfmt. Analyze uses three five-minute attempts per stage. Sherif stays report-only. Knip applies its
built-in fixes before the agent runs. Analyze does not add a dirty-tree gate, which matches Fix.

## Why the earlier decision changed

ADR 0002 rejected headless driving because provider flags drifted independently. A terminal handoff
avoided those contracts, but it could not bound runtime, retry from detector feedback, or support
non-interactive repair. The new design accepts the vendor contract cost and contains it in one table
with minimum versions, dated provenance, exact tests, capped stderr, timeouts, and process-group kill
escalation.

## Consequences

- Detector output, not an agent exit code, determines success.
- Agent retries are bounded. Timeout cleanup sends SIGTERM and then SIGKILL after a grace period.
- A non-interactive dirty Doctor run needs `--allow-dirty`. Fix and Analyze keep their existing
  mutation policy.
- Vendor major releases require the real-agent smoke checklist and an update to the contract table.
- The no-agent path stays available. Doctor prints or copies Markdown, while Fix and Analyze keep
  their normal command behavior when no agent is selected.
