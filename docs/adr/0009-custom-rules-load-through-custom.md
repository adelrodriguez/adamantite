# Custom rules load from a rules folder through custom()

We decided (2026-10-03, issue #473) that a target project can write its own Oxlint rules
in a rules folder, `.adamantite/rules/` by default, and enable all of them with
`custom()` from `adamantite/lint/custom`. These are **custom rules**. They are the first
surface that the target project authors and Adamantite loads, so the division of work is
explicit: Adamantite owns the wiring and the authoring guidance, and the target project
owns the correctness and the tests of its rules.

`GLOSSARY.md` lists "plugin" as a term to avoid. User-facing text says "custom rules" and
"rules folder". "Plugin" stays only for the Oxlint `jsPlugins` entry and its `name`
option, because those are Oxlint terms.

The design comes from spikes against Oxlint 1.83 on Node.js 24 and Bun 1.4, and the tests
repeat them against the pinned Oxlint:

- A file is a rule. There is no registry, entry file, or generated code in the target
  project. A file that starts with `_` is a helper.
- `custom()` resolves a relative `dir` from the file that calls it, which it finds in the
  call stack. `process.cwd()` gives the wrong folder when Oxlint runs from a subfolder or
  loads a nested config. A shared tooling package in a monorepo can call `custom()` with
  its own `dir`, and every config that extends it loads the same folder. Node.js and Bun
  print stack frames differently, so the parser has a test for each format, and `dir`
  accepts an absolute path as the escape hatch.
- Oxlint caches a plugin module by its path and drops query strings, so `custom()` writes
  one small entry module for each rules folder to `node_modules/.cache/adamantite/`, or to
  the OS temporary directory when no writable `node_modules` folder is found. The entry
  module imports `loadRules` from `adamantite/rules` by file URL.
- `custom()` returns an empty config when the rules folder does not exist, so `init` adds
  it to every generated `oxlint.config.ts`.
- `adamantite/rules` re-exports `defineRule` and the rule and AST types from
  `@oxlint/plugins`, so a rule file has one import and the target project installs nothing
  extra. `@oxlint/plugins` is a runtime dependency for that reason, pinned to the Oxlint
  version.
- Doctor stays read-only and does not run rule code. It parses each rule file with
  `oxc-parser` and reports syntax errors, TypeScript that type stripping cannot erase, and
  a missing default export. It starts from the Oxlint config of the root and of each
  workspace package, follows relative imports and imports of workspace packages to the
  `custom()` calls, and reports a rules folder that no call loads and two folders that
  share a plugin name. A call in a module that no config imports does not count.

## Consequences

- A rule file with an `enum` or another non-erasable construct stops the whole lint run.
  Doctor names the file and the line, and `loadRules` puts the cause in the error message,
  because Oxlint prints only the message.
- A rule that throws prints an error for each file, and the lint run still exits 0. The
  authoring guidance tells authors to read the lint output after a change.
- Oxlint caches the loaded rules, so an editor language server needs a restart after a rule
  changes.
- Doctor cannot follow a `dir` or `name` that is not a string literal. It reports a warning.
  For a `dir`, it does not check that folder. For a `name`, it still checks the folder, but
  not that the plugin name is unique.
- Adamantite scaffolds rule tests and runs them with `adamantite rule test`, not with `check`,
  which stays Oxfmt plus Oxlint (2026-10-28, issue #525). A broken rule otherwise fails
  silently: Oxlint loads it, it reports nothing, and `check` passes. `rule add` writes
  `tests/<name>.ts` in the rules folder. `custom()` does not read subfolders, and the default
  Vitest and Jest patterns do not match the file, so neither loads it.
- `rule test` runs the tests with `node --test`, not with the project's test runner. Spikes
  against Oxlint 1.88 showed that `RuleTester` refuses Bun and that Jest in CommonJS mode
  cannot load `oxlint/plugins-dev`. The CLI runs on Node.js, so `node --test` works in every
  project that runs Adamantite.
- The managed GitHub workflow runs `rule test` when the project has rule tests (issue #558),
  so CI catches a rule that stops reporting. `check` still does not run them. A Deno workflow
  with rule tests also sets up Node.js, because `node --test` needs it.
- `adamantite/rules/testing` re-exports `RuleTester` from `oxlint/plugins-dev` and connects it
  to `node:test`, so a test needs one import and each case reports by name. Its declarations
  export only `RuleTester`, so a type-aware lint run needs no `@types/node`. It imports
  `oxlint` at run time, so `oxlint` is an optional peer dependency.
- Read-only installs, such as some CI sandboxes and Yarn Plug'n'Play, use the temporary
  directory. That path is not tested.
