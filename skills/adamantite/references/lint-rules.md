# How to repair preset rule reports

## Repair the reported code

Read the rule message and apply the section below that matches it.

- For `adamantite/no-react-state-hooks`, follow the message's replacement for the hook.
  Moving the call into a hook module only to silence the report leaves the problem in place.
  Set `allow` only when the project's hook layout differs from the default.
- For `adamantite/require-effect-dependencies`, pass every value that the effect reads as the
  dependency array, or `[]` when it reads none. An array that leaves out a value that the
  effect reads gets a `react/exhaustive-deps` report.
- For `adamantite/no-overzealous-destructuring`, keep the object and read its members, or split
  the pattern. Raising `maxDepth` or `maxProperties` only to pass the check hides the problem.
- For `adamantite/require-suppression-reason`, first try to fix the code. If a suppression is
  necessary, state why the rule does not apply after `--`. Naming the rule or adding a single
  `-` gives no reason. For example, use
  `// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`.
- For `no-warning-comments`, fix the code or track the work in the project's issue tracker.
  Renaming `TODO` to another marker only to pass the check leaves the work untracked.
- For `adamantite/query-from-loader` reports on `useQuery` or `useSuspenseQuery`, replace a
  plain options object or a local `queryOptions()` call with shared options. Define them with
  `queryOptions()` at module scope or in an exported factory. Preload them with
  `ensureQueryData()` in the loader and pass the same options to the hook. For reports on
  `useInfiniteQuery` or `useSuspenseInfiniteQuery`, use `infiniteQueryOptions()` with
  `ensureInfiniteQueryData()`. Wrapping options in a spread or moving the hook out of the route
  only to silence the report leaves the preload problem unresolved.
- For `adamantite/no-query-data-in-state`, read query data from the query result and keep
  only the user's edits in state.
- For `adamantite/layers` and `adamantite/import-owners`, use what the owner exports, or move the
  code to its layer or owner. Adding an owner, a layer dependency, or an `ignore` glob only to
  pass the check weakens the standard. To change a layer map or the import owners, use the
  `adamantite-hardening` skill.
- For `effecttsgo/unstable-api-usage`, add a deliberately accepted module or package to
  `allowedUnstableApis` in the `@effect/language-service` tsconfig entry. For example, list
  `"effect/cli"` to allow that module instead of disabling the rule for every unstable API.

Continue when the reported code follows the rule's repair and the affected lint check passes.

## Change test rule configuration

If a Jest or Vitest preset needs different test paths or rule settings, replace its entry in
`extends` with a project override. Use the preset's exported `testFiles`, or the project's
test paths, with its `plugins` and `rules`. For example:

```ts
import vitest, { testFiles } from "adamantite/lint/vitest"
import { defineConfig } from "oxlint"

export default defineConfig({
  overrides: [{ files: testFiles, plugins: vitest.plugins, rules: { ...vitest.rules } }],
})
```

Change test rules in that override. Top-level rules do not replace the preset's test override.
Keep `plugins` in it, because Oxlint ignores `vitest/*` rules without the plugin.

Extend the Jest preset or the Vitest preset, not both. They report the same defects, so each defect
gets two reports. If one package runs both test runners, use each preset in an override with test
paths that do not overlap.
Continue when the intended test files receive the configured rules.

## Repair an existing rules folder

When Doctor reports that Oxlint cannot load a config or a rule file, read the error that it
names. Load the rules folder with the default import from `adamantite/rules`, and import
`definePlugin`, `defineRule`, and the authoring types from `adamantite/rules/plugin`. For a name
that the installed package does not export, search the `CHANGELOG.md` of the installed
`adamantite` package for the name, and use the replacement that it names. A rule
file must load with type stripping, so replace TypeScript that Node.js cannot erase, such as an
`enum`.

When Doctor reports a rules folder that no `custom()` call loads, load it with `custom()`, and set
its path with `dir` when it is not `.adamantite/lint`.
Preserve rule behavior, plugin names, severity, and options.

Continue when Doctor reports no custom-rule findings and no config load failure.

## Check the repair

- The changed code or configuration follows the project's coding standard.
- The affected lint check passes without a broader exception added only to silence it.
- Doctor reports no custom-rule finding and no config load failure after a rules folder repair.
