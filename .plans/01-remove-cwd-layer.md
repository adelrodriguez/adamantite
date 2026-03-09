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

## Suggested Execution Order

1. `utils.ts`
2. `DependencyInstaller`
3. `init` and `update`
4. package helpers
5. editor helpers
6. CI helpers
7. test cleanup
8. `Cwd` deletion

## Acceptance Criteria

- No production code depends on `src/services/cwd.ts`
- Commands read cwd only at the boundary
- Helpers and utilities accept explicit cwd input
- Tests no longer rely on a `Cwd` layer except during the transition
- `bun run format`, `bun run test`, `bun run typecheck`, and `bun run check` all pass
