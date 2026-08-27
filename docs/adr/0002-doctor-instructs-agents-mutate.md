# Doctor instructs; agents mutate

Migrations and doctor's fix machinery encoded transformations between enumerated states
and grew brittler with every legacy state discovered. We decided (2026-08-20) to make
`adamantite doctor` assess-and-instruct only: the CLI deterministically detects broken
state and emits findings — current state, goal criteria, verification — and agents or
humans perform the mutations, with doctor's re-run as the convergence oracle.

The decisions:

- Init keeps deterministic `create()` and its write paths; templating into empty space
  is reliable and must not require an agent. Doctor never writes files. `update` writes
  managed dependency changes only.
- `doctor --fix` is removed (stubbed with a pointer error for one release; removal is
  tracked in [#394](https://github.com/adelrodriguez/adamantite/issues/394)). `update`
  survives, scoped to dependency bumps, then runs doctor's assess-and-render pipeline;
  it keeps exiting 0 while findings remain, so doctor stays the only CI gate.
- Migrations are not ported one-to-one. Doctor assesses each managed surface against
  its ideal state (including absence criteria for legacy files); every state the old
  migrations could repair must be flagged by some assessment, with the migration test
  fixtures carried over to prove it. One exception (2026-08-20): the legacy
  `typecheck` script is deliberately forgotten — no detection, and the deprecated CLI
  alias is removed. All `migrate()` code and the snapshot/rollback machinery are
  deleted; transformation knowledge survives as instruction notes.
- Detection becomes content-level with required-subset semantics (oxlint's inspection
  model generalized): required shape must be present, user additions pass. Exact-match
  comparison is rejected because it permanently flags legitimate customizations.
- Findings are colocated with the detection code, and one combined prompt is emitted
  per run. Two renderings (terminal view, markdown prompt) derive from the same
  structs; only presentation may differ.
- Creation findings embed exact canonical content; repair findings are criteria-first
  with canonical content as reference, preserving user customizations.
- In a TTY, Doctor renders the findings, explains that a coding agent can run Doctor
  directly, and offers a best-effort OSC 52 clipboard copy of the Markdown prompt.
  Non-TTY gets Markdown and an exit code only. Findings produce the repair prompt and
  exit 1. Assessment warnings alone produce a warning report and exit 0.
- Direct Claude Code and Codex CLI invocation was removed on 2026-08-25. Their prompt,
  permission, sandbox, and trust flags changed independently and made the integration
  brittle. Headless CLI driving stays rejected for that reason.
- Interactive handoff returned on 2026-08-26 as a TTY handoff: Doctor spawns the agent
  CLI interactively with inherited stdio and a one-line seed prompt that tells the agent
  to run Doctor itself. The agent's own UI owns permissions, trust, and authentication,
  so Adamantite passes no provider flags and never sees the repair session. Doctor
  reassesses once after the session ends; the agent's exit code is ignored. An ACP-based
  handoff was designed and rejected for this release: it only pays off for non-TTY hosts
  or agents without a CLI. The full plan lived at `docs/plans/acp-agent-handoff.md` and
  was removed on 2026-08-27; recover it from Git history if ACP becomes relevant.
- `AGENTS.md` and the shipped skill slim to "run `adamantite doctor` and follow its
  instructions"; instructions exist only in doctor's output.

## Consequences

- Newly discovered legacy states cost a detection check and instruction text, not
  transformation code, rollback handling, and their tests.
- A version bump can leave a project flagged-but-not-fixed until an agent or human acts
  on the findings; `update`'s contract changes from "converges" to "converges or points
  you to Doctor".
- The oracle is only as strong as `assess`: any managed config without content-level
  inspection weakens the verification step, so new managed surfaces must ship with
  inspection (phase 2 covers zed, vscode, the GitHub workflow, and tsconfig).
- Atomicity moves from `runMigration` snapshots to git hygiene; the Markdown prompt
  surfaces the clean-tree requirement.
- CI scripts calling `doctor --fix` break on the next minor; the stub error and a
  changeset document the replacement.
