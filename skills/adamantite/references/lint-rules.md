# How to repair preset rule reports

## Repair the reported code

Read the rule message and apply the section below that matches it.

- For `adamantite/no-react-state-hooks`, follow the message's replacement for the hook.
  Moving the call into a hook module only to silence the report leaves the problem in place.
  Set `allow` only when the project's hook layout differs from the default.
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
- For `effecttsgo/unstable-api-usage`, add a deliberately accepted module or package to
  `allowedUnstableApis` in the `@effect/language-service` tsconfig entry. For example, list
  `"effect/cli"` to allow that module instead of disabling the rule for every unstable API.

Continue when the reported code follows the rule's repair and the affected lint check passes.

## Configure layer maps and import owners

If the task changes import rules, use the first-party plugin loaded by `architecture` or
`strict`. The `architecture` preset enables no rules until the project configures them.

Set `adamantite/layers` with a layer map. Give each layer an `imports` list of sibling
layers. Imports are transitive. Put a child map in the containing layer's `layers` property:

```ts
import architecture from "adamantite/lint/architecture"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [architecture],
  rules: {
    "adamantite/layers": [
      "error",
      {
        root: "src",
        layers: {
          lib: {
            imports: [],
            layers: {
              shared: { imports: [] },
              services: { imports: ["shared"] },
            },
          },
          terminal: { imports: ["lib"] },
          commands: { imports: ["terminal"] },
        },
      },
    ],
  },
})
```

Resolve `root` from the nearest `package.json` folder. The `lib` child map has the root
`src/lib`, and its dependency names are local to that map. Every containing map checks a
file independently. A child permission cannot override a parent prohibition. Declaration
order does not change permissions.

Use `entries` for composition files, `isolate` for layers whose child folders cannot import
each other, and `ignoreTypes` when type-only imports do not count. Add import `conditions`
explicitly when resolution needs them. The rule does not read tsconfig `customConditions`.
An unresolved import is not checked. A folder missing from the map is reported. Move a
loose root file into a layer or declare it as an entry.

Place child settings beside the child's `layers`. Settings do not inherit. A parent's
`ignore`, `entries`, or `ignoreTypes` does not skip child checks. A child root uses the
parent's actual matched folder, including when the top root is a glob. Declare each
concrete scope once. Keep separate option objects for roots that cannot nest without a
new intermediate map.

If the config uses the previous array-valued declarations, run `adamantite doctor` and
follow its migration instructions. Preserve every dependency and map setting. Nest only
existing compatible child scopes. Verify allowed and forbidden imports with
`adamantite check`, then run Doctor again. Continue when the migrated maps preserve the
project's intended imports and Doctor reports no layer-map migration finding.

For an import that belongs to one file or folder, set `adamantite/import-owners`:

```ts
import architecture from "adamantite/lint/architecture"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [architecture],
  rules: {
    "adamantite/import-owners": [
      "error",
      { import: "giget", owners: ["src/services/download.ts"] },
      { import: "react-native", names: ["Alert"], owners: ["src/shared/alerts.ts"] },
      { import: "#lib/database.ts", owners: ["src/lib/repositories"] },
    ],
  },
})
```

Resolve owners from the workspace root, or the `package.json` folder outside a workspace.
An owner folder covers every file below it. A package name covers its subpaths.
Use `names` to restrict selected exports. Namespace imports and `export *` are also reported
when names are restricted. An `import` that starts with `#`, `.`, or `/` names a file or folder of
the project, resolved from the same root as the owners. The rule resolves each import of a linted
file, so a relative path or another alias to that module counts too. An import that names a `#`
module as the option states it also counts, as for a package. In a monorepo, a `#` option restricts
that alias in every package. To restrict a folder of one package, name its path from the workspace
root, such as `./apps/web/src/lib/db`. Use layer maps for the dependencies between folders.

Repair a report by using what the owner exports or moving the code to its layer or owner.
Adding an owner, layer dependency, or `ignore` glob only to pass the check weakens the standard.
Continue when the configured maps and owners match the project's intended imports.

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
Continue when the intended test files receive the configured rules.

## Try a rule setting

Before changing a rule setting, run `adamantite rule try <rule> --report <case> --accept <case>`
when the task requires evidence from cases. Use `--options '<json array>'` for options after
the severity, or `--current` for the setting in the config. A case is a project path, or
`<path>=<file>` to lint the content of `<file>` at `<path>` in a copy of the project.

Continue when every case gives the expected result. Exit code 1 means a case differs.
Exit code 2 means the trial could not supply evidence, such as when the rule does not exist.

## Check the repair

- The changed code or configuration follows the project's coding standard.
- The affected lint check passes without a broader exception added only to silence it.
- Each requested trial ran successfully and gave the expected results.
