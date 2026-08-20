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
  /** End criteria, as bullets — normally the same facts assess checks. */
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
finding state the same facts the inspection checks (the one exception, a goal the
oracle cannot re-check, is documented in the managed-scripts surface below).
Exact-match comparison is rejected:
it would permanently flag legitimate user customizations.

### Ideal-state coverage replaces migrations

Migrations are not ported one-to-one. Doctor assesses the current state of each
managed surface against its ideal state and emits findings for the difference; where a
project came from is irrelevant. All `migrate()` code, `runMigration`, the
snapshot/rollback machinery, and the migration registry are deleted. There is no
trigger separate from the goal, so a partially applied fix keeps its finding open —
with one named exception: a goal whose satisfaction is unobservable after the fact
(the `check`-script half of the alias replacement below) is enforced through the
finding's goal text and the prompt rules, not the oracle.

The coverage obligation: every state the old migrations could repair must still be
detected, which means every surface they touched has an assessment whose ideal state
flags the legacy condition. Two general rules carry over from the old system. First,
when a surface's applicability gate fails but the surface is visibly off-ideal, the
assessment emits a warning, not a finding — mirroring the warning-only branches the
migrations had (no CI-compatible scripts, no package manager detected, unsupported
package manager). Second, ideal states use required-subset semantics throughout:
user-chosen values and customizations pass; only adamantite-owned state is asserted.

Per surface:

- Tooling configs (knip, oxfmt, oxlint): the active config is the `.ts` file with the
  required content, and no legacy `.json`/`.jsonc` config shadows or replaces it. The
  absence criterion is a deliberate widening, not coverage parity: when a valid `.ts`
  config was active, the old migration never ran and the stray legacy file only drew a
  warning. It becomes a finding because it has a clear ideal state (absent) and a
  trivial, safe repair.
- Managed scripts: no script invokes the deprecated `adamantite typecheck` alias.
  That is the whole of the phase 1 detection for this surface. While the alias is
  present, the finding's goals demand a replacement, not a deletion: remove the alias
  _and_ ensure a `check` script exists, adding the managed command only when the
  `check` key is absent — matching the old `migrate()`'s `scripts.check ??=` and the
  required-subset rule (a customized `check` stays untouched). Once the alias is gone,
  replaced-vs-deleted is unobservable — the same limitation as script drift, since
  nothing records the init-time selection and a customized command is
  indistinguishable from a slot never taken — so the `check` half is enforced through
  the finding's goals and the prompt's do-not-suppress rule rather than the oracle.
  Script drift beyond the alias stays out of scope (init already keeps and reports
  conflicting scripts).
- tsconfig: `tsconfig.json` exists and its `extends` includes adamantite's preset,
  applicable only outside a monorepo — a missing file is a finding, not
  not-applicable. In a monorepo the `MONOREPO_GUIDANCE` text is surfaced as a warning
  instead.
- CI workflow: an existing `.github/workflows/adamantite.yml` references the `check`
  script and uses no hardcoded node version where the resolver belongs, applicable
  only when the managed scripts are CI-compatible with a supported package manager
  (warnings per the general rule when that gate fails). The assessment never creates a
  workflow.
- Zed settings: no oxfmt entries still carrying the stale defaults the old preset
  wrote — matched on key and value, as `checkIsStaleOxfmtSetting` does today, so
  user-customized values are preserved.

The tsconfig, workflow, and Zed assessments are narrow phase 1 slivers of the phase 2
surfaces, kept so no state the tool repairs today goes undetected.

The six migrations survive as two humbler assets. Their test fixtures (~1,300 lines
enumerating real legacy states) carry over as assessment fixtures proving the coverage
obligation. And their transformation knowledge becomes instruction `notes` — a finding
whose `currentState` is a legacy `knip.json` tells the agent to port the settings into
the `.ts` config and then delete the legacy file, preserving user content rather than
recreating from scratch. Coupled legacy states need no special handling: the combined
prompt (below) already presents co-occurring findings together.

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
function — lives in `src/lib/`, and the clack terminal renderer lives in the terminal
layer (`src/terminal/`, alongside `Prompter`), matching the rule that lib returns data
and the command/terminal layers render it.

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
- Afterward, re-assess once and report converged or the surviving findings. The
  process exit code follows the invoking command's contract: doctor exits 1 while
  findings survive; `update` keeps its own exit rule (below) even after a spawn. No
  outer retry loop: the agent already loops internally against the oracle, and a
  second identical round doubles cost without a human look-in.

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
itself fails. This rule wins in every path through `update`, including after a spawned
harness run from its TTY menu: the shared pipeline provides assess, render, and menu,
but the exit contract belongs to the invoking command. Doctor is the only CI gate;
giving `update` doctor's exit contract would break existing CI jobs at exactly the
common moment, since bumps are what create findings.

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

1. Define the `Finding` type and rework `assess` signatures; define the ideal state
   per managed surface (including absence criteria for legacy configs); delete
   `src/lib/migrations/`, carrying its test fixtures over as assessment fixtures.
2. Build content-level inspection for knip and oxfmt configs on the oxlint model, plus
   the standalone tsconfig, workflow, and Zed-settings assessments that complete the
   coverage obligation; express every finding's goal bullets from the same checks.
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

Extend assessment and findings to full coverage of the init-only surfaces: zed,
vscode, GitHub workflow, tsconfig — beyond the narrow phase 1 slivers the coverage
obligation already lands there. Instruction-based repair makes this cheap — detection
plus instruction text, no merge machinery. Requires content-level checks to be
meaningful (editor settings files always exist once the editor is used). Spec
separately.

## Out of scope

- Per-finding selection (one prompt covering a chosen subset).
- An outer retry loop around harness spawns.
- Harnesses beyond Claude Code and Codex (the table makes additions a row, not a
  feature).
- A `--json` output mode.
- Pruning old legacy-state detections; that happens on its own schedule.

## Completion

Delete this file when the work is complete.
