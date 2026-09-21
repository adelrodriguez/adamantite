# Managed plugins stay npm packages

A lint preset can need a third-party Oxlint plugin. We decided (2026-09-21, issue #403,
PR #467) that a plugin published on npm is a **managed plugin**: it stays an npm package
that the target project installs, and Adamantite manages its version. The first one is
`@shadcn/lint` for the `shadcn` preset. Vendoring stays only for plugins that are not
published, such as anti-slop.

PR #467 first vendored `@shadcn/lint`. The vendored build worked, but it had to ship a
second file, the `tailwind-worker.js` that the plugin starts beside itself, and every
Adamantite install carried 270 KB for a preset that most projects do not select. The
reason to vendor was the plugin's ESLint peers, and both are optional.

A managed plugin has these parts:

- A tooling integration in `src/lib/integrations/tooling/` made with
  `definePackageTooling` and its `lintPreset` option. The package is required only while
  `oxlint.config.ts` imports the preset.
- The pinned version comes from the devDependency in `package.json`, through
  `getDependencyVersion`.
- The package is not a peer dependency, not even an optional one. With an optional peer,
  npm still validates the peer's own optional peers. For `@shadcn/lint` that chain reaches
  `@typescript-eslint/parser`, which needs TypeScript below 6.1, and Adamantite needs
  TypeScript 7. `npm install adamantite` then fails with `ERESOLVE` in every project, with
  or without the preset. The smoke test found this.
- `init` installs the pinned package when the preset is selected. Doctor reports a
  missing or off-pin package. `update` moves it with the other managed dependencies.
- The preset names the plugin by its bare package name in `jsPlugins`. Oxlint resolves
  it from the target project. `import.meta.resolve` was tested too and works under npm,
  pnpm, and bun, but it needs the peer link, it is not runtime-neutral on old Bun
  versions, and a missing plugin fails with a module resolution stack trace. The bare
  name fails with `Cannot find module '@shadcn/lint'`.

## Consequences

- A target project that adds a managed preset by hand must also install the plugin.
  Doctor reports it.
- Upstream owns rule behaviour, so a managed plugin has no per-rule fixtures. Its preset
  test asserts that the enabled rule ids equal the plugin's exported `rules`, so an
  upstream rename fails the version bump.
- The managed lane has an install cost too. `@shadcn/lint@0.1.5` holds `oxc-parser` 0.148
  as an optional dependency and Adamantite holds 0.150, so a project that selects the
  preset keeps two copies of the parser.
- With npm, a target project must list `typescript` in its own `package.json` before the
  plugin is added in a separate step. If TypeScript is present only as Adamantite's
  auto-installed peer, `npm install @shadcn/lint` fails with `ERESOLVE` through the
  plugin's optional `@typescript-eslint/parser` peer. One `npm install` of Adamantite and
  the plugin together works, and that is what `init` runs.
- A plugin with native dependencies or a restrictive license can use this lane. It could
  not be vendored.
