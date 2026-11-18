# How to configure layer maps and import owners

To state which folder or file may import another, use the first-party plugin loaded by `architecture` or
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

When Doctor warns that a config states import layers by hand in `no-restricted-imports`
overrides, follow the steps in the warning to state those layers in layer maps.

Place child settings beside the child's `layers`. Settings do not inherit. A parent's
`ignore`, `entries`, or `ignoreTypes` does not skip child checks. A child root uses the
parent's actual matched folder, including when the top root is a glob. Declare each
concrete scope once. Keep separate option objects for roots that cannot nest without a
new intermediate map.

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

Continue when the configured maps and owners match the project's intended imports.

## Check the import rules

- Each layer map and each import owner states an import that the project intends.
- A file that breaks the rule is reported, and a file that follows it is not.
- No owner, layer dependency, or `ignore` glob exists only to make the check pass.
