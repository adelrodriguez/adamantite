# The test presets scope themselves to test files

Issue #500 found that the `jest` and `vitest` presets reported scripts and library code: a
preset in `extends` applies to every file, and test rules such as `vitest/require-hook` report
top-level calls in any file. We decided (2026-10-19, PR #520) that each test preset scopes its
rules to its test files, and that a target project can still use the preset in an override of its
own.

Every other preset is a flat config, and a target project reads its parts as properties, such as
`core.ignorePatterns` or `vitest.rules`. A test preset must support two uses:

- `extends: [vitest]` must apply the rules only to test files.
- `overrides: [{ files, plugins: vitest.plugins, rules: { ...vitest.rules } }]` must work without
  `extends`, so a project can choose other files and change rules.

One plain object cannot do both. Oxlint applies the top-level `rules` of an extended config to
every file, so `vitest.rules` cannot be a top-level property. Oxlint also rejects keys that are not
config keys, such as `files`, in an extended config.

Each test preset is an object with one enumerable property, an `overrides` entry for its
`testFiles`, and with `plugins` and `rules` as non-enumerable properties. Oxlint 1.88 reads a JS
config through `JSON.stringify` (`loadConfigs` in `oxlint/dist/js_config.js`), which skips
non-enumerable properties. So `extends` sees only the scoped override, and JavaScript still reads
`vitest.plugins` and `vitest.rules`. `testFiles` is a named export, because a `files` property
would make `extends` fail.

## Considered options

- **`init` writes the override, and doctor reports a test preset in `extends`.** This keeps the
  presets flat and explicit, but every target project must migrate, and a `doctor` CI gate fails
  until it does.
- **A scoped default export with named `plugins` and `rules` exports.** This needs no property
  trick, but the test presets would be the only presets that a project cannot read as
  `vitest.rules`.

## Consequences

- `init` and doctor treat the test presets like every other preset. Target projects get the fix
  when they update, with no migration.
- A top-level `rules` entry does not change a test rule in test files, because the preset's
  override replaces it. A project changes a test rule in an override that lists
  `plugins: vitest.plugins`. Oxlint ignores the `vitest/*` rules of an override without it.
- The design depends on how Oxlint reads a JS config, which Oxlint does not document. If Oxlint
  reads non-enumerable properties, the rules apply to every file again, as before #500.
  `src/__tests__/presets/test-presets.test.ts` lints with both uses in a real Oxlint run, so an
  Oxlint update that changes this fails the tests.
- `{ ...vitest }` copies only the override. Spread `vitest.rules` instead.
