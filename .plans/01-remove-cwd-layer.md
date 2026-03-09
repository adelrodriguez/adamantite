# Remove `Cwd` Layer

## Goal

Remove the ambient `Cwd` Effect service and replace it with explicit `cwd` data passed from command boundaries into utilities, services, and helpers.

This should be done incrementally to avoid a large parameter-threading rewrite landing all at once.

## Why

- `cwd` is execution context, not a deep domain service.
- Explicit `cwd` makes path-dependent behavior visible in function signatures.
- Tests can pass temp directories directly instead of building `Cwd` layers.
- The codebase already moved toward explicit system boundaries with `CommandRunner` and `DependencyInstaller`.

## Non-Goals

- Do not change user-facing CLI commands or flags.
- Do not change config file formats or output locations.
- Do not rewrite unrelated services like `Prompter`.
- Do not require a single large refactor if the migration can be staged safely.

## Migration Strategy

Use a staged migration rather than deleting `Cwd` immediately.

1. Add optional `cwd?: string` parameters to utilities and helpers that currently rely on ambient cwd.
2. Update command handlers and service seams to pass `cwd` explicitly from the boundary.
3. Update tests to prefer direct `cwd` arguments over `Cwd` layer injection.
4. Remove remaining `Cwd` usages.
5. Delete `src/services/cwd.ts` only after no meaningful consumers remain.

## Target End State

- `process.cwd()` is only read at the command boundary.
- Reusable helpers and utilities accept `cwd` explicitly.
- `CommandRunner` continues to accept `cwd` as part of its run options.
- `DependencyInstaller` accepts `cwd` explicitly for package manager detection and install operations if needed.
- Tests no longer need a `Cwd` layer for helper and command behavior where direct `cwd` is sufficient.

## Step 1: Inventory Current `Cwd` Usage

Find all direct and indirect usages of:

- `src/services/cwd.ts`
- `yield* Cwd`
- helper modules using `process.cwd()` internally
- tests that provide a fake `Cwd` layer

Expected hotspots:

- `src/commands/typecheck.ts`
- `src/commands/init.ts`
- `src/services/dependency-installer.ts`
- `src/utils.ts`
- helper modules under `src/helpers/`
- tests in `__tests__/`

## Step 2: Make Utilities Accept `cwd`

Refactor utility functions first because they are shared seams.

Change signatures toward:

```ts
readPackageJson(cwd?: string)
checkIsMonorepo(cwd?: string)
```

Rules:

- If `cwd` is provided, use it.
- If omitted, fall back to `process.cwd()` during the migration period.
- Avoid requiring a `Cwd` service inside these functions.

Verification:

- `utils` tests still pass.
- New call sites can pass explicit temp dirs.

## Step 3: Make Helper Modules Accept `cwd`

Refactor helper modules that currently use `process.cwd()` internally.

Representative targets:

- `src/helpers/packages/oxlint.ts`
- `src/helpers/packages/oxfmt.ts`
- `src/helpers/packages/typescript.ts`
- `src/helpers/packages/knip.ts`
- `src/helpers/editors/vscode.ts`
- `src/helpers/editors/zed.ts`
- `src/helpers/ci/github.ts`

Preferred shape:

```ts
oxlint.exists(cwd?: string)
oxlint.create(cwd?: string, presets?: string[])
oxlint.update(cwd?: string, presets?: string[])
```

Equivalent explicit `cwd` parameters should be added for the other helpers.

Rules:

- Keep behavior unchanged.
- Preserve current file names and locations relative to the provided cwd.
- During migration, allow omission of `cwd` only as a compatibility fallback.

Verification:

- Expand or adjust helper integration tests to pass temp dirs directly where practical.

## Step 4: Push `cwd` from Command Boundaries

Update command handlers to read cwd once and pass it down.

Pattern:

```ts
const cwd = process.cwd()
```

Then pass `cwd` to:

- helper functions
- `readPackageJson(cwd)`
- `checkIsMonorepo(cwd)`
- `DependencyInstaller.detectPackageManager(cwd)`
- config creation/update helpers

Notes by command:

- `typecheck` already passes cwd into `CommandRunner`; keep that model.
- `init` should compute cwd once and pass it through all helper/setup operations.
- `update` should pass cwd into package/config detection and migration helpers.

## Step 5: Simplify `DependencyInstaller`

Move `DependencyInstaller` away from ambient `Cwd`.

Preferred shape:

```ts
detectPackageManager(cwd: string)
addDevDependencies(
  packages: string[],
  options?: { workspace?: boolean; silent?: boolean }
)
```

If installation itself does not need cwd, keep it out of that method.
If future `nypm` usage needs cwd, add it explicitly rather than reintroducing ambient state.

Verification:

- `init` and `update` behavior tests remain green.

## Step 6: Migrate Tests Away from `Cwd` Layer

Update tests to prefer direct cwd arguments.

Expected changes:

- helper tests call functions with temp dirs directly
- service tests stop proving `Cwd` injection behavior
- command tests only use `process.chdir(tempDir)` or direct `cwd` arguments where the public contract supports it

Keep only the tests that still prove meaningful consumer-visible behavior.

## Step 7: Remove Compatibility Fallbacks

Once the codebase is fully migrated:

- make `cwd` required in utilities/helpers where that improves clarity
- remove temporary `cwd ?? process.cwd()` fallback logic if it is no longer useful

This step is optional. If compatibility convenience still helps, keep `cwd` optional.

## Step 8: Delete `Cwd`

Only after all usages are removed:

- delete `src/services/cwd.ts`
- remove `Cwd` from `src/index.ts`
- remove `Cwd` from tests and helper harnesses

## Risks

- Large parameter-threading churn across helper modules
- Temporary mixed model if some code still uses ambient cwd and some uses explicit cwd
- Command/helper signatures may become noisier if the migration is not scoped carefully

## Risk Mitigation

- Land the migration in small vertical slices
- Keep compatibility fallbacks during transition
- Update tests alongside each slice instead of after the entire refactor
- Prefer command-by-command or helper-by-helper rollout

## Execution Slices

Each slice is a standalone commit. Run `bun run test && bun run typecheck && bun run check && bun run format` after each.

### Slice 1: Utilities (`src/utils.ts`)

**Files changed:**

- `src/utils.ts` — `readPackageJson(cwd?: string)` and `checkIsMonorepo(cwd?: string)`. Remove `yield* Cwd` calls. Use `cwd ?? process.cwd()` as fallback.
- `src/__tests__/utils.test.ts` — Pass temp dirs explicitly to `readPackageJson(tempDir)` and `checkIsMonorepo(tempDir)`. Remove `Cwd` layer from `runEither` calls. Keep `process.chdir` for now since helpers still need it.

**Current `Cwd` usage (to remove):**

- `readPackageJson()` — `src/utils.ts:80-81` (`yield* Cwd`, `cwd.get`)
- `checkIsMonorepo()` — `src/utils.ts:94-95` (`yield* Cwd`, `cwd.get`)

**No downstream breakage:** All callers of `readPackageJson()` and `checkIsMonorepo()` currently pass no arguments, so adding an optional parameter is backward-compatible.

### Slice 2: DependencyInstaller (`src/services/dependency-installer.ts`)

**Files changed:**

- `src/services/dependency-installer.ts` — Remove `Cwd` import and `yield* Cwd`. Accept `cwd: string` in `detectPackageManager(cwd)`. The `addDevDependencies` method does not need cwd (nypm uses process.cwd internally for install).
- `src/commands/__tests__/command-test-helpers.ts` — Remove mock `Cwd` layer from `createDependencyInstallerTestContext`. Update `runCommand` to stop providing `Cwd` layer.

**Current `Cwd` usage (to remove):**

- `src/services/dependency-installer.ts:36` (`yield* Cwd`)
- `src/services/dependency-installer.ts:41,50` (`cwd.get`)

**Callers to update:** `init.ts` and `update.ts` must pass `cwd` when calling `detectPackageManager`.

### Slice 3: Package helpers (`src/helpers/packages/`)

**Files changed (4 helpers):**

- `src/helpers/packages/oxlint.ts` — Add `cwd: string` parameter to `create(cwd, presets)`, `exists(cwd)`, `update(cwd)`. Replace `process.cwd()` at lines 99, 110, 111, 142.
- `src/helpers/packages/oxfmt.ts` — Add `cwd: string` to `create(cwd)`, `exists(cwd)`, `update(cwd)`. Replace `process.cwd()` at lines 20, 31, 32.
- `src/helpers/packages/typescript.ts` — Add `cwd: string` to `create(cwd)`, `exists(cwd)`, `update(cwd)`. Replace `process.cwd()` at lines 16, 27, 34.
- `src/helpers/packages/knip.ts` — Add `cwd: string` to `create(cwd)`, `exists(cwd)`, `update(cwd)`. Replace `process.cwd()` at lines 17, 28, 29.

**Test files changed (4 test files):**

- `src/helpers/packages/__tests__/oxlint.test.ts` — Pass `tempDir` to all helper calls. Can remove `process.chdir(tempDir)` from beforeEach.
- `src/helpers/packages/__tests__/oxfmt.test.ts` — Same.
- `src/helpers/packages/__tests__/typescript.test.ts` — Same.
- `src/helpers/packages/__tests__/knip.test.ts` — Same.

**Note:** `sherif.ts` has no file I/O, so no changes needed.

**Internal callers in oxlint.ts:** `oxlint.update()` calls `oxlint.exists()` internally (line 133). After this slice, `update(cwd)` must forward `cwd` to `exists(cwd)`.

### Slice 4: Editor and CI helpers (`src/helpers/editors/`, `src/helpers/ci/`)

**Files changed (3 helpers):**

- `src/helpers/editors/vscode.ts` — Add `cwd: string` to `create(cwd)`, `exists(cwd)`, `update(cwd)`, `installExtensions(cwd)`. Replace `process.cwd()` at lines 60, 76, 130.
- `src/helpers/editors/zed.ts` — Add `cwd: string` to `create(cwd)`, `exists(cwd)`, `update(cwd)`. Replace `process.cwd()` at lines 87, 102, 108.
- `src/helpers/ci/github.ts` — Add `cwd: string` to `create(cwd, ...)`, `exists(cwd)`, `update(cwd, ...)`. Replace `process.cwd()` at lines 169, 190, 197.

**Test files changed (3 test files):**

- `src/helpers/editors/__tests__/vscode.test.ts` — Pass `tempDir` directly.
- `src/helpers/editors/__tests__/zed.test.ts` — Same.
- `src/helpers/ci/__tests__/github.test.ts` — Same.

### Slice 5: Commands (`src/commands/`)

**Files changed:**

- `src/commands/init.ts` — Read `const cwd = process.cwd()` once at the top of the handler. Pass `cwd` to all helper calls (`oxlint.create(cwd, ...)`, `oxfmt.create(cwd)`, `knip.create(cwd)`, `typescript.create(cwd)`, `vscode.create(cwd)`, `zed.create(cwd)`, `github.create(cwd, ...)`, `readPackageJson(cwd)`, `checkIsMonorepo(cwd)`, `addScripts(cwd, ...)`). Remove `yield* Cwd`.
- `src/commands/update.ts` — Read `const cwd = process.cwd()` once. Pass to `readPackageJson(cwd)`, `oxlint.exists(cwd)`, `oxlint.update(cwd)`.
- `src/commands/typecheck.ts` — Already reads cwd for `CommandRunner`. Replace `yield* Cwd` with `const cwd = process.cwd()`.

**Test files updated:**

- `src/commands/__tests__/init.test.ts` — Remove `Cwd` layer from `runCommand`. Keep `process.chdir(tempDir)` since `process.cwd()` is now read directly in commands.
- `src/commands/__tests__/update.test.ts` — Same.
- `src/commands/__tests__/typecheck.test.ts` — Same.

**Note:** `check.ts`, `fix.ts`, `format.ts`, `analyze.ts`, `monorepo.ts` do not use `Cwd` and need no changes.

### Slice 6: Cleanup

**Files deleted:**

- `src/services/cwd.ts`

**Files changed:**

- `src/index.ts` — Remove `Cwd` import and `Cwd.layer` from the layer composition (line 52).
- `src/version.ts` — Remove `Cwd.layer` from the Effect provider (line 16). `readPackageJson()` no longer needs it.
- `src/commands/__tests__/command-test-helpers.ts` — Remove `Cwd` import and mock `Cwd` layer from `runCommand` / `runCommandWithRunner`.
- `src/__tests__/utils.test.ts` — Remove any remaining `Cwd` layer usage.

**Final verification:** `grep -r "Cwd" src/` returns zero results.

## Acceptance Criteria

- No production code depends on `src/services/cwd.ts`
- Commands read cwd only at the boundary via `process.cwd()`
- Helpers and utilities accept explicit `cwd` input
- Tests no longer rely on a `Cwd` layer
- `bun run test`, `bun run typecheck`, `bun run check`, and `bun run format` all pass
