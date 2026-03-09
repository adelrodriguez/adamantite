# Improve Test Coverage

## Goal

Fill the identified test coverage gaps across helpers, error classes, and command edge cases.

## Priority Order

1. knip helper (biggest gap -- 1 test vs 8-10 in sibling helpers)
2. init command edge cases (untested user-facing paths)
3. update command error paths (untested failure propagation)
4. errors.ts (untested message formatting logic)

## Slice 1: knip helper tests

**File:** `src/helpers/packages/__tests__/knip.test.ts`

**Current state:** 1 test (version sync only).

**Model after:** `src/helpers/packages/__tests__/oxfmt.test.ts` (8 tests) and `src/helpers/packages/__tests__/typescript.test.ts` (9 tests).

**Tests to add:**

### `exists()`

- **No config files present:** Call `knip.exists()` in empty temp dir. Assert `{ path: null }`.
- **`knip.json` present:** Write `knip.json`, assert returned path ends with `knip.json`.
- **`knip.jsonc` present:** Write `knip.jsonc`, assert returned path ends with `knip.jsonc`.
- **Both present:** Write both files. Assert `knip.json` wins (checked first at `knip.ts:31`).

### `create()`

- **Happy path:** Call `knip.create()`, verify `knip.json` exists, parse contents and verify it matches `knip.config` (the preset).

### `update()`

- **Merge with existing config:** Write `knip.json` with custom entries (e.g., `{ "entry": ["src/main.ts"] }`). Call `update()`. Verify user entries are preserved and `$schema` is set to the JSON variant (`https://unpkg.com/knip@5/schema.json`).
- **JSONC schema path:** Write `knip.jsonc` with `{}`. Call `update()`. Verify `$schema` is `https://unpkg.com/knip@5/schema-jsonc.json`.
- **Empty config merge:** Write `{}` to `knip.json`. Call `update()`. Verify merged config includes preset values and `$schema`.
- **`FileNotFound`:** Call `update()` with no config files. Assert error `_tag: "FileNotFound"`.
- **`FailedToReadFile`:** Create `knip.json` as a directory (`mkdirSync`). Call `update()`. Assert error `_tag: "FailedToReadFile"`.
- **`InvalidConfigFormat`:** Write `[]` (a JSON array, not an object) to `knip.json`. Call `update()`. Assert error `_tag: "InvalidConfigFormat"`.

## Slice 2: init command edge cases

**File:** `src/commands/__tests__/init.test.ts`

### No package manager detected

- Pass `{ detectedPackageManager: null }` to `createDependencyInstallerTestContext`.
- Run `initCommand`.
- Assert `Exit.isFailure(exit)`.
- Verify the failure cause contains `NoPackageManager`.

### GitHub Actions workflow creation

- Select CI-compatible scripts (e.g., check, format, typecheck).
- Provide `true` for editor extensions confirm and `true` for GitHub Actions confirm in `confirmResponses`.
- Assert `.github/workflows/adamantite.yml` is created in `tempDir`.
- Verify content includes the correct package manager setup step and job matrix matching the selected scripts.

### OperationCancelled

This requires extending `createPrompterTestContext` to support simulating cancellation.

**Option A (simpler):** Add a `cancelAtPromptIndex` option. When the Nth prompt is reached, the mock returns `Effect.fail(new OperationCancelled({}))` instead of a value.

**Option B (minimal):** Provide zero `confirmResponses` or `multiselectResponses` so the mock throws when exhausted, then catch and verify behavior. This is fragile and not recommended.

Prefer Option A. Then:

- Configure prompter to cancel at the first multiselect (script selection).
- Run `initCommand`.
- Assert `Exit.isSuccess(exit)` (the `catchTags` handler converts it to a graceful exit).
- Verify `prompter.cancels` includes the cancellation message.

## Slice 3: update command error paths

**File:** `src/commands/__tests__/update.test.ts`

### Dependency installation failure

- Write `package.json` with outdated deps.
- Pass `{ confirmResponses: [true] }` to prompter.
- Pass `{ addDevDependenciesError: new FailedToInstallDependency({ packages: ["oxlint@1.50.0"] }) }` to `createDependencyInstallerTestContext`.
- Assert `Exit.isFailure(exit)`.

### OperationCancelled during update

Same approach as init (requires Slice 2's prompter extension).

- Configure prompter to cancel at the confirm prompt.
- Assert graceful exit with cancel message.

## Slice 4: errors.ts

**File:** `src/__tests__/errors.test.ts` (new file)

Test the `message` getter on error classes with branching logic. Skip trivial data-only classes.

### `FailedToParseFile`

- **Empty errors array:** `new FailedToParseFile({ errors: [], path: "foo.json" }).message` contains "Unknown JSON/JSONC parsing error".
- **1-3 errors:** Message includes each error's offset and code.
- **More than 3 errors:** Message only shows first 3 (`.slice(0, 3)` at `errors.ts:12`).

### `FailedToInstallDependency`

- **With packages array:** Message lists the package names.
- **Without packages (undefined):** Message uses fallback text.

### `CommandFailed`

- **With message:** Message includes the provided text.
- **Without message:** Verify it does not crash.

### Tag verification (spot check)

- `new CliNotFound({ command: "oxlint" })._tag === "CliNotFound"`
- `new FileNotFound({ path: "/foo" })._tag === "FileNotFound"`

## Dependencies Between Slices

- Slices 1, 3, and 4 are independent and can be done in any order.
- Slice 2 (init edge cases with OperationCancelled) requires extending `command-test-helpers.ts`, which Slice 3 also depends on for the same feature.
- Recommended order: Slice 1 -> Slice 4 -> Slice 2 -> Slice 3.

## Acceptance Criteria

- `bun run test` passes with all new tests.
- `bun run test:coverage` shows improved coverage for `knip.ts`, `errors.ts`, `init.ts`, and `update.ts`.
- No existing tests are broken or removed.
- `bun run typecheck`, `bun run check`, and `bun run format` all pass.
