# Replace Babel Parser With Oxc Parser

## Goal

Replace Adamantite's use of `@babel/parser` with `oxc-parser` for the `oxlint-typecheck` migration logic.

The intent is to remove the remaining Babel parser dependency from the project and align the implementation with the rest of the OXC-based toolchain.

## Current State

Adamantite currently appears to use `@babel/parser` in one real implementation path:

- `src/lib/migrations/oxlint-typecheck.ts`

The dependency is declared in:

- `package.json`

The migration logic in `src/lib/migrations/oxlint-typecheck.ts` currently:

- parses `oxlint.config.ts`
- inspects the AST to find the exported config object
- patches `options.typeAware` and `options.typeCheck`
- rejects unsupported shapes for safe manual intervention

The current implementation is written against Babel-style AST node names and shapes such as:

- `ObjectProperty`
- `ObjectMethod`
- `StringLiteral`
- `BooleanLiteral`

The relevant behavior is covered by:

- `src/lib/migrations/__tests__/oxlint-typecheck.test.ts`

## Why

- Adamantite already centers around OXC tooling: `oxlint`, `oxfmt`, and their presets.
- `@babel/parser` is an outlier dependency for a single migration path.
- `oxc-parser` is a more coherent fit for the project and reduces Babel surface area.
- The parser usage is isolated enough that this is a focused refactor instead of a broad architecture change.

## Non-Goals

- Do not rewrite the `oxlint-typecheck` migration behavior itself.
- Do not broaden this into a general AST utility layer unless it becomes clearly necessary.
- Do not relax the migration's current safety guarantees around unsupported config shapes.
- Do not change the migration's user-facing warnings and failure modes except where AST differences require small wording updates.

## Architectural Direction

Keep the existing migration strategy and text-patching approach.

Only replace the parsing and AST inspection layer.

The migration should continue to:

- support direct `export default {}` config objects
- support `export default defineConfig({})`
- patch only supported literal object shapes
- stop with a manual-fix error when the config shape is too dynamic or ambiguous

The parser swap should be internal, not a behavior redesign.

## Expected AST Impact

This is not a drop-in dependency swap.

`oxc-parser` returns ESTree / TS-ESTree style nodes, while the current implementation assumes Babel node shapes.

That means the following parts of `src/lib/migrations/oxlint-typecheck.ts` will need to be adapted:

- exported config detection
- static property name detection
- object property and method discrimination
- literal boolean detection
- any type guards that currently assume Babel node names

Examples of likely node-shape updates:

- Babel `ObjectProperty` -> ESTree `Property`
- Babel `ObjectMethod` -> ESTree `Property` with method semantics or other ESTree-compatible representation
- Babel `StringLiteral` -> ESTree `Literal`
- Babel `BooleanLiteral` -> ESTree `Literal`

The exact mapping should be verified against `oxc-parser` output during implementation rather than guessed from Babel behavior.

## Scope

This plan includes:

- replacing `@babel/parser` usage in `src/lib/migrations/oxlint-typecheck.ts`
- adding `oxc-parser` as the parser dependency if needed
- removing `@babel/parser` from `package.json` if no longer used anywhere
- updating tests that depend on parser-specific AST behavior
- validating the migration under Bun, since Adamantite runs on Bun

This plan does not include unrelated parser refactors elsewhere in the codebase.

## Implementation Plan

### 1. Confirm the full dependency surface

Before changing code, verify there are no remaining runtime uses of `@babel/parser` outside:

- `src/lib/migrations/oxlint-typecheck.ts`

If no other usage exists, the migration can remove the dependency entirely after the refactor lands.

### 2. Add `oxc-parser` and validate runtime compatibility

Add `oxc-parser` to the project dependencies.

Because Adamantite is executed with Bun, explicitly validate that:

- the package installs cleanly with Bun
- the parser can be imported in the current runtime
- the sync parse path works in tests and local execution

Prefer `parseSync(...)` unless async parsing is clearly needed. This migration operates on one local config file at a time, so synchronous parsing is the simplest fit.

### 3. Replace the parser entry point in `oxlint-typecheck`

Update `src/lib/migrations/oxlint-typecheck.ts` to use `oxc-parser` instead of `@babel/parser`.

Recommended direction:

- use `parseSync(filename, content, options)`
- provide a TypeScript-aware parse mode
- request node ranges if needed for patching logic
- keep the current `null` fallback on parse failure so the migration still degrades into a safe manual path

### 4. Rewrite AST guards for ESTree / TS-ESTree

Refactor the AST helper layer in `src/lib/migrations/oxlint-typecheck.ts` so it matches `oxc-parser` node shapes.

Key functions that will likely need updates:

- `parseOxlintConfig(...)`
- `getStaticPropertyName(...)`
- `getExportedConfigObject(...)`
- `getNamedObjectProperty(...)`
- `patchOptionsObject(...)`
- `insertOptionsObject(...)`

Recommended implementation style:

- keep local narrow type guards
- avoid introducing broad parser abstraction layers
- stay explicit about supported node shapes
- preserve the current conservative fallback to manual migration for unsupported cases

### 5. Preserve text-based patch semantics

Do not rewrite the migration to regenerate the entire file from AST.

Keep the current string replacement model based on AST ranges so that:

- formatting stays minimally changed
- comments and nearby user code are preserved
- the migration remains readable and low-risk

The parser swap should feed the same patching pipeline, not replace it.

### 6. Expand and stabilize tests

Use the existing test suite in `src/lib/migrations/__tests__/oxlint-typecheck.test.ts` as the baseline compatibility contract.

Make sure all current scenarios still pass, especially:

- direct exported object literals
- `defineConfig(...)` wrappers
- inserting missing `options`
- patching existing `options`
- rejecting dynamic or duplicate shapes
- ignoring braces in comments and strings

Add focused tests if needed for any ESTree-specific edge cases discovered during implementation.

### 7. Remove Babel parser dependency

Once all tests pass and no other usage remains:

- remove `@babel/parser` from `package.json`

If `oxc-parser` ends up requiring additional type packages for clean typing, add only the minimum needed.

### 8. Validate quality gates

After the code change:

- run `bun run format`
- run `bun run check`
- run `bun run test`
- run `bun run analyze`

`analyze` matters here because this change modifies dependency usage directly.

## Files To Change

Expected implementation files:

- `src/lib/migrations/oxlint-typecheck.ts`
- `package.json`

Expected test files:

- `src/lib/migrations/__tests__/oxlint-typecheck.test.ts`

Potentially affected lock/build files depending on install flow:

- `bun.lock`

## Risks

- `oxc-parser` AST node shapes differ from Babel enough that subtle migration regressions could slip in.
- N-API or Bun compatibility could introduce unexpected runtime issues.
- Range handling may differ slightly from Babel, affecting string patch boundaries.
- TS config syntax accepted by Babel and OXC may differ at the margins.

## Risk Mitigation

- keep the parser migration narrowly scoped to one file
- rely on the existing migration test suite as the behavior contract
- add targeted regression tests for any shape that needs special handling
- preserve the current manual-fix fallback whenever AST inspection becomes uncertain
- verify dependency/runtime behavior with `bun run test`, `bun run check`, and `bun run analyze`

## Acceptance Criteria

- `src/lib/migrations/oxlint-typecheck.ts` uses `oxc-parser` instead of `@babel/parser`
- the migration behavior remains functionally equivalent for supported config shapes
- unsupported shapes still fail safely with manual-fix behavior
- all `oxlint-typecheck` tests pass
- `@babel/parser` is removed from `package.json` if no longer used
- project quality gates pass, including `bun run analyze`
