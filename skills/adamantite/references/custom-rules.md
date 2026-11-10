# How to write and verify custom rules

## Select the rules folder

Use a custom rule for a recurring project coding standard that existing rules cannot check.
Keep it in the target project. A first-party preset change is a different task.

Find the `custom()` call imported from `adamantite/rules` in the project's Oxlint configuration.
It loads `.adamantite/lint` by default, relative to the file that calls it, and enables each
rule as `error` under `project`. Thus `no-process-env.ts` becomes `project/no-process-env`.
Use `dir` for another folder. In a monorepo, give each rules folder its own plugin `name`,
because Oxlint rejects duplicate plugin names in one run. A nested Oxlint config replaces
the root config. Extend the root config when the package needs its rules.

Continue when you have identified the loaded rules folder and its plugin name.

## Repair an existing rules folder

If Doctor reports the previous API, replace `adamantite/lint/custom` with the default import
from `adamantite/rules`. Move authoring imports to `adamantite/rules/plugin`.
Move the old default folder to `.adamantite/lint`, or set its path with `dir`.
Preserve rule behavior, plugin names, severity, and options.

Continue when Doctor reports no custom-rule wiring findings.

## Write the rule

For a new rule, run `adamantite rule add <name>`. It writes only a stub.
Use `adamantite rule ast <file>` on real code to find the node types that visitors receive.

Apply these authoring constraints:

- Export the rule as default with `defineRule` from `adamantite/rules/plugin`.
  Import `Context`, `Rule`, `Visitor`, and `ESTree` types from that module when needed.
- Use `createOnce`, which runs once for the lint run. Reset per-file state in `before` and
  report collected results in `after`. Read `context.filename`, `context.sourceCode`, and
  `context.settings` in `before` or a visitor. They are unavailable in the `createOnce` body.
- Write erasable TypeScript. Replace an `enum` with a plain object, for example.
  Node.js type stripping cannot load enums, namespaces with values, parameter properties,
  or `import x = require()`.
- Use the AST and `context.sourceCode`. Custom rules receive no type information.
- Report with a `messageId` defined in `meta.messages`. State what the author must do
  instead and link the coding standard. Define options in `meta.schema` and read `context.options`.
- Keep substantial logic in plain functions in a `_<name>.ts` helper when that makes the
  rule clearer. Files that start with `_`, declaration files, and `.test.*` files are not rules.
  Subfolders are not loaded.

Continue when the rule implements the standard and every report gives a repair.

## Verify the rule

Use `RuleTester` from `adamantite/rules/testing` with Node.js, also in a Bun project.
Put code that must report in `invalid` and similar code that must pass in `valid`.
Cover the syntax forms and file paths to which the standard applies.
For a bug fix, first run a regression case and confirm that it fails. Fix the rule and rerun
all cases. Change a case only when it is wrong, and explain the change.

Run temporary cases from stdin or a temporary file beside the rule. For the generated
`no-debugger` stub, this command checks the report and an accepted TypeScript declaration:

```sh
node --input-type=module <<'JS'
import { RuleTester } from "adamantite/rules/testing"
import rule from "./.adamantite/lint/no-debugger.ts"

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run("no-debugger", rule, {
  invalid: [{ code: "debugger", errors: [{ messageId: "unexpected" }] }],
  valid: ["const value: number = 1"],
})
JS
```

Adapt the cases to the completed rule. Verify a helper directly only when its cases are too
many for RuleTester. During harden, use `adamantite rule test add <name>` to prepare temporary
cases, adapt them, and run `adamantite rule test --path <test-file>`.
If a saved test already exists, preserve it and use stdin for additional temporary cases.

Run lint and read all output. A rule that throws can print an error for every file while
Oxlint still exits 0. Restart the editor language server after changing a rule, because
Oxlint caches rules for each run.

Continue when every valid and invalid case passes and lint output contains no rule errors.

## Keep saved tests when requested

If the user requests new saved tests, run `adamantite rule test add <name>` and adapt its
valid and invalid cases. Use `--dir` for another rules folder or `--path` for another test location.
Keep `.test.ts` for tests beside rules, so the plugin does not load them as rules.
Run saved tests with `adamantite rule test`, or `adamantite rule test --path <file>` for a test elsewhere.

Saved tests use `node:test`. Exclude them from Vitest `test.exclude` or Jest
`testPathIgnorePatterns`, while keeping the runner's default and existing exclusions.
Init, CI generation, and harden do not run saved tests by default. Preserve existing test
files and CI steps. Add new CI test steps only when requested.

Continue when the saved tests pass and the project's other test runners do not collect them.

## Check project integration

If TypeScript must check the rules folder, add `.adamantite/lint` to tsconfig `include`.
TypeScript skips the dot folder by default. Enable `allowImportingTsExtensions` when checking
tests that import `.ts` rule files.

Knip treats rules and optional `.test.*` files in `.adamantite/lint` as entry files in the
root and workspace packages. For another folder, keep the preset's entry patterns and add
the folder's rule and test patterns to `oxlint.entry` in `knip.config.ts`.
Add tests saved elsewhere to the Knip entry settings if needed.

Remove temporary cases, fixtures, and verification-only helpers that you created.
Keep the rule, its runtime helpers, required configuration, and user-owned saved tests.
Run `adamantite check` and `adamantite doctor`.

Continue when both commands pass and no temporary verification files remain.

## Check the rule

- Every valid and invalid case passes, including the regression case for a bug fix.
- Lint output contains no rule errors, regardless of its exit code.
- Doctor reports no findings, and the project's checks pass.
- Temporary verification files are removed, and user-owned tests and CI steps remain.
