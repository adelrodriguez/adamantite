# Doctor instructs; agents mutate

Migrations and doctor's fix machinery encoded transformations between enumerated states
and grew brittler with every legacy state discovered. We decided (2026-08-20) to make
`adamantite doctor` assess-and-instruct only: the CLI deterministically detects broken
state and emits findings — current state, goal criteria, verification — and agents or
humans perform the mutations, with doctor's re-run as the convergence oracle. See
[the implementation plan](../plans/agent-first-doctor.md) for the full design.

The decisions:

- Init keeps deterministic `create()` and its write paths; templating into empty space
  is reliable and must not require an agent. Doctor and `update` never write files.
- `doctor --fix` is removed (stubbed with a pointer error for one release). `update`
  survives, scoped to dependency bumps, then runs doctor's assess-and-render pipeline.
- All six migrations port their `check()` detection to findings; all `migrate()` code
  and the snapshot/rollback machinery are deleted.
- Detection becomes content-level with required-subset semantics (oxlint's inspection
  model generalized): required shape must be present, user additions pass. Exact-match
  comparison is rejected because it permanently flags legitimate customizations.
- Findings are colocated with the detection code, and one combined prompt is emitted
  per run. Two renderings (terminal view, markdown prompt) derive from the same
  structs; only presentation may differ.
- Creation findings embed exact canonical content; repair findings are criteria-first
  with canonical content as reference, preserving user customizations.
- In a TTY, doctor offers to spawn Claude Code or Codex headless (PATH-detected,
  extensible table) with edit-level permissions, a printed command, and a dirty-tree
  confirmation, then re-assesses once — no outer retry loop. Non-TTY gets the report
  and exit code only. The prompt is also printable with best-effort OSC 52 clipboard
  copy.
- Harness invocation sits behind an injectable service so tests run a fake harness.
- `AGENTS.md` and the shipped skill slim to "run `adamantite doctor` and follow its
  instructions"; instructions exist only in doctor's output.

## Consequences

- Newly discovered legacy states cost a detection check and instruction text, not
  transformation code, rollback handling, and their tests.
- A version bump can leave a project flagged-but-not-fixed until an agent or human acts
  on the prompt; `update`'s contract changes from "converges" to "converges or hands
  you a prompt".
- The oracle is only as strong as `assess`: any managed config without content-level
  inspection weakens the verification step, so new managed surfaces must ship with
  inspection (phase 2 covers zed, vscode, the GitHub workflow, and tsconfig).
- Atomicity moves from `runMigration` snapshots to git hygiene; the prompt and the
  spawn flow both surface the clean-tree requirement.
- CI scripts calling `doctor --fix` break on the next minor; the stub error and a
  changeset document the replacement.
