# Plan: agent-first doctor

## Goal

Turn `adamantite doctor` into an assess-and-instruct command. The CLI deterministically
detects and describes broken state; agents (or humans) perform the mutations. Doctor's
assessment is the oracle that defines convergence: every finding states the current
state, the goal criteria, and the verification step "run `adamantite doctor`, expect
exit 0". Delete the migration system and every write path that doctor and `update` own
today.

## Background

The brittleness in doctor and `update` is concentrated in mutation code, not detection:

- `src/lib/migrations/` is 765 lines of transformation code (plus snapshot/rollback
  machinery in `runMigration`) that branches on config formats, monorepo-ness, workflow
  existence, and package-manager support — and still bails with warnings on states it
  cannot handle. Every newly discovered legacy state means more transformation code and
  tests, forever.
- Migrations encode transformations (state A to state B). Instructions encode the goal
  state plus an oracle, so the set of legacy states no longer needs enumeration: the
  agent bridges from whatever state exists, and doctor's re-assessment decides whether
  it converged.
- Doctor and `update` assess only the five tooling integrations (knip, oxfmt, oxlint,
  sherif, tsgolint). The zed, vscode, GitHub-workflow, and tsconfig write paths are
  init-only and not assessed for drift — precisely because assessing them would have
  required merge machinery. (Two migration checks read parts of those surfaces, but
  nothing verifies their content.) Instruction-based repair makes that coverage cheap
  (phase 2).
- Drift detection today is existence-and-extension only for every config except oxlint,
  which parses content and classifies `configured`/`patchable`/`manual`. An oracle that
  cannot tell "fixed" from "file exists" would pass agent runs that did not converge, so
  detection must become content-level.

## Design

### Findings replace actions

Each integration's `assess` returns structured findings in place of today's action union
(`create_config`/`update_config`/`manual_fix`/`run_migration`):

```ts
interface Finding {
  /** Stable machine-readable key, e.g. "legacy-knip-json". */
  readonly id: string
  /** Source integration, for grouping and re-assessment diffs. */
  readonly integration: string
  readonly title: string
  /** What was detected and why it is a problem. */
  readonly currentState: string
  /** End criteria — the same facts assess checks, as bullets. */
  readonly goal: readonly string[]
  /** Canonical file content, when applicable. */
  readonly reference?: string
  /** Constraints: preserve user customizations, monorepo caveats, and similar. */
  readonly notes?: readonly string[]
}
```

`install_package` and `update_package` actions remain structured (update consumes them),
but doctor renders them as findings whose instruction is to run `adamantite update`.
Findings are colocated with the detection code that triggers them so criteria and
instructions cannot drift; a renderer owns tone and format, integrations own substance.
Re-assessment diffs, tests, and fixtures key on `id`, never on prose fields.

### Content-level oracle

Generalize oxlint's `inspectRequiredOxlintConfig` model to every managed config:
required-subset semantics, not exact match. Parse the config, assert the required
options and shape are present, and let user additions pass. The goal bullets in each
finding state the same facts the inspection checks. Exact-match comparison is rejected:
it would permanently flag legitimate user customizations.

### Legacy states port to findings

All six migrations' `check()` detection logic ports over as finding-emitting assessments
(legacy `knip.json`, legacy oxfmt JSON, legacy oxlint JSON, legacy typecheck script,
hardcoded node version, stale Zed oxfmt settings). All `migrate()` code, `runMigration`,
and the snapshot/rollback machinery are deleted.

Porting rule: each ported finding's goal criteria must cover the full end state its
`migrate()` produced, not just the trigger its `check()` tested. The concrete case is
`legacy-typecheck-script`: its `check()` reads one script key, but its `migrate()`
wrote five files. It stays one finding (the states are coupled — that is why it was one
migration), and its goals cover the script rename, the oxlint config (already verified
by oxlint's own content-level assessment), the tsconfig `extends` including
adamantite's preset, and the CI workflow referencing the `check` script. The last two
need small new checks (roughly ten lines each) that land in phase 1 as early slivers of
the phase 2 surfaces. Doctor must not exit 0 while a partially applied legacy migration
remains.

### Prompt

One combined prompt per run. Findings are frequently coupled (a script rename touches
the oxlint config touches the CI workflow), and a single prompt keeps the verification
unambiguous. Template:

```markdown
# Adamantite doctor findings

This project uses Adamantite <version> to manage linting/formatting/type tooling.
`adamantite doctor` found N issue(s). Fix them so that `adamantite doctor` exits 0.
Before editing, make sure the working tree is clean or the user has accepted the risk.

## 1. <finding title>

- **Current state:** <what was detected and why it is a problem>
- **Goal:** <end criteria bullets>
- **Reference:** <canonical content in a fenced block, when applicable>
- **Notes:** <constraints>

## Verify

Run `adamantite doctor`. All findings above must be gone and it must exit 0.
Do not suppress or work around checks; fix the underlying state.
```

Two non-negotiable lines: the git-clean warning (the copy-prompt path has no dirty-tree
confirmation, so this is its only safety net) and the do-not-suppress line (an agent
optimizing for "exit 0" will otherwise silence checks instead of fixing state).

For creation findings (file missing), embed the exact canonical content from the
existing builders (`toOxlintTsConfigContent` and friends, which init keeps) and instruct
the agent not to improvise. For repair findings (file exists but fails criteria), the
criteria are the contract and the canonical content is a known-good reference; the agent
must preserve user customizations that still satisfy the criteria.

### Two renderings, one source

Findings render twice from the same structs: a human-styled terminal view (clack log
blocks) and the markdown prompt used by copy-prompt and the spawn path. Only
presentation may differ between the renderings, never substance; both are exercised by
the same fixture-driven tests.

Placement: `src/lib/**` must not import `#terminal/*` (the `no-restricted-imports`
override in `oxlint.config.ts`), so the markdown renderer — a pure struct-to-string
function — lives in `src/lib/`, and the clack terminal renderer lives in the command
layer (`src/terminal/`), matching the rule that lib returns data and commands render
it.

### Doctor command flow

1. Assess. If no findings, exit 0.
2. Print the terminal rendering of every finding. Exit code is 1 while findings exist.
3. If stdout and stdin are both TTYs (the menu prints to one and reads from the
   other), offer a menu: fix with Claude Code, fix with Codex (each shown only if its
   binary is detected on PATH, driven by a small extensible harness table), or get the
   prompt. Other consumers (agents, CI, pipes, redirected stdin) get the report and
   exit code, no menu, no detection heuristics.
4. "Get the prompt" prints the markdown prompt and attempts an OSC 52 clipboard copy
   (write-and-forget escape sequence, no dependency, silent no-op where unsupported).
5. `--fix` is removed. The flag remains parseable for one release and errors with a
   pointer to the new model, then disappears.

### Harness spawn

Selecting a harness runs it headless (`claude -p` / `codex exec`) with the markdown
prompt. Verify the exact flag names for both CLIs at implementation time; do not bake
today's into code without checking.

- Permissions: edit-level plus what the verification command needs (file edits and
  running `adamantite doctor` / `adamantite update`), not full autonomy.
- Print the exact command before spawning.
- Warn and confirm when the working tree is dirty; do not hard-refuse.
- Afterward, re-assess once and report converged or the surviving findings, with the
  matching exit code. No outer retry loop: the agent already loops internally against
  the oracle, and a second identical round doubles cost without a human look-in.

The invocation lives behind an injectable Effect service following the
`DependencyInstaller` pattern (`src/lib/workspace/`): the service owns process spawning
and PATH detection only, no terminal I/O. The command echo, dirty-tree confirmation,
and spinner stay in `doctor.ts` via `Prompter`, keeping the lib/terminal lint boundary
intact. Tests substitute a fake harness that mutates fixture files.
Integration tests pin the loop's failure modes: harness missing, nonzero exit, partial
fix, full convergence. Real-harness runs stay manual.

### update command

`update` survives, scoped to dependency bumps (keeping the fallback sweep over known
packages). After bumping it runs the same assess-and-render pipeline as doctor — a
version bump is exactly what creates legacy states, so the findings and prompt appear at
the moment they are needed — including the TTY menu. Its migration pass and "Doctor
follow-up" lines are deleted. Doctor never installs packages; its outdated-package
findings instruct running `adamantite update`.

Exit code: `update` keeps exiting 0 when the bumps succeed, even while findings
remain — findings in its output are informational. It exits nonzero only when a bump
itself fails. Doctor is the only CI gate; giving `update` doctor's exit contract would
break existing CI jobs at exactly the common moment, since bumps are what create
findings.

### init unchanged

Init keeps deterministic `create()` and its editor/CI/tsconfig write paths. Templating
into empty space is reliable and must not require an agent. The canonical content
builders therefore survive and double as the prompt's reference content.

### Documentation collapses to one source

`AGENTS.md` guidance and `skills/adamantite/SKILL.md` slim down: the repair sections
reduce to "run `adamantite doctor`; it prints findings with goal criteria and
verification — follow them." The skill keeps only what doctor cannot say (init flags,
daily-workflow scripts). Instructions exist in exactly one place — doctor's output — so
stale copies become structurally impossible.

## Steps

1. Define the `Finding` type and rework `assess` signatures; port the six migration
   `check()`s into finding-emitting assessments under the porting rule (goals cover
   each `migrate()`'s full end state); delete `src/lib/migrations/` and its tests.
2. Build content-level inspection for knip and oxfmt configs on the oxlint model, plus
   the tsconfig-`extends` and workflow-script checks the legacy-typecheck finding
   needs; express every finding's goal bullets from the same checks.
3. Build the two renderers from shared finding structs — markdown prompt in
   `src/lib/`, terminal view in `src/terminal/` — with snapshot tests.
4. Rework `doctor.ts`: assess, render, exit codes, `--fix` stub error. Delete the fix
   machinery and its tests.
5. Add the TTY menu, harness table with PATH detection, OSC 52 copy.
6. Add the harness-runner service (`src/lib/workspace/`, `DependencyInstaller`
   pattern), the spawn flow in `doctor.ts` (permission flags, command echo, dirty-tree
   confirm), post-run re-assessment, and fake-harness integration tests.
7. Rework `update.ts`: bumps plus the shared assess-and-render pipeline, keeping exit 0
   while findings remain; delete its migration pass and tests.
8. Slim `writeAgentsGuidance` and `SKILL.md`; update README and `docs/architecture.md`.
9. Minor changeset describing the breaking `doctor --fix` removal and the new model.

## Phase 2 (named, not specified here)

Extend assessment and findings to the init-only surfaces: zed, vscode, GitHub workflow,
tsconfig. Instruction-based repair makes this coverage cheap — detection plus
instruction text, no merge machinery. Requires content-level checks to be meaningful
(editor settings files always exist once the editor is used). Spec separately.

## Out of scope

- Per-finding selection (one prompt covering a chosen subset).
- An outer retry loop around harness spawns.
- Harnesses beyond Claude Code and Codex (the table makes additions a row, not a
  feature).
- A `--json` output mode.
- Pruning old legacy-state detections; that happens on its own schedule.

## Completion

Delete this file when the work is complete.
