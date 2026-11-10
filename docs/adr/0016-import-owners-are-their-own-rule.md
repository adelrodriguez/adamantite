# Import owners are their own first-party rule

packref allows `giget` only in `src/lib/sources/repository/fetch.ts` and `nypm` only in
`package-manager-detector.ts`. v1 allows `zod` only in `packages/utils`. 100times keeps
`tryharder`, `@tanstack/react-query`, and the `react-native` `Alert` out of its route folders.
Each one took a `no-restricted-imports` ban and an override that allowed the owner. We decided
(2026-10-29, issue #547) that a first-party rule, `adamantite/import-owners`, states each import
with its owners one time.

The rule is not an option of `adamantite/layers`. A layer map is about the folders of one root,
and it skips bare packages. An owner is about one package across the project, and in a monorepo
the owner is often in another package than the importer, such as `packages/utils`. So the rule
takes the same option form as `layers`: each option after the severity is one object, here one
import and its owners. `strict` loads the rule and does not turn it on, because the owners belong
to one project.

The rule matches a package import as written. A module covers its subpaths, so `zod` covers
`zod/mini`. An `import` that starts with `#`, `.`, or `/` names a module of the project instead,
such as `#lib/workspace/monorepo.ts` or the folder `#lib/integrations/tooling`. A text match there
lets a relative path, such as `./monorepo.ts`, bypass the owners, so the rule resolves each import
of a linted file with the resolver of `adamantite/layers` and compares files. The module resolves
from the root that owner paths use, and a folder covers each file that `<import>/<path>` resolves
to. We added this on 2026-11-09, after an audit found that this repository's own entries matched
only their `#` spelling. `names` restricts only some exports,
such as `Alert`, and a namespace import or `export *` of that module is a report, because it
reaches the restricted exports.

Owner paths are relative to the workspace root: the nearest folder that lists workspace packages,
in `pnpm-workspace.yaml` or in the `workspaces` field of `package.json`. Outside a workspace they
are relative to the nearest `package.json` folder, the anchor of `adamantite/layers` (ADR 0013).
The layers anchor alone cannot name an owner in another package of a monorepo, and the workspace
root is where a root Oxlint config states its `files` globs. A `pnpm-workspace.yaml` without
`packages` holds only settings, so it is not a workspace root.

## Considered options

- **An option of `adamantite/layers`.** It mixes package ownership into a layer map, and a map's
  root and anchor cannot name an owner in another package.
- **A record of imports, such as `{ giget: ["src/fetch.ts"] }`.** It is shorter, but it cannot
  hold `names` without a second value form, or two entries for one module.
- **`no-restricted-imports` with overrides.** This is the duplication that issue #524 removes,
  and its message cannot name the owner.
- **Reject project modules in the options.** The rule stays a text match, but a project that
  protects one of its own modules then needs a custom rule that resolves imports anyway.

## Consequences

- An owner path in a monorepo starts at the workspace root, such as `packages/utils`, even in a
  nested Oxlint config.
- A project that is below a workspace root but is not one of its packages gets the outer root.
- Type-only imports count. An `ignoreTypes` option is a follow-up if a project needs one.
- An option for a project module resolves the imports of each linted file that it applies to.
  An alias from `tsconfig.json` `paths` that does not start with `#`, `.`, or `/`, such as `@/db`,
  is still matched as written.
- A `#` option also matches an import as written, as a package does. In a monorepo, an alias that a
  workspace package declares in its own `package.json` does not resolve from the workspace root,
  so only that text match finds it, and a relative path to the same file is not reported. The
  text match also restricts the same alias in every other package, as a package option does. A
  path option, such as `./apps/web/src/lib/db`, names the folder of one package.
