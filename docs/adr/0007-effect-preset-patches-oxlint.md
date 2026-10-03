# The effect preset patches Oxlint, and its rules are curated

The `effect` preset reports misuse of Effect through
[`@effect/tsgo`](https://github.com/Effect-TS/tsgo), the Effect Language Service for
TypeScript-Go. We decided (2026-10-03, issue #485) that `@effect/tsgo` is a managed plugin
(ADR 0003), that its rules run in Oxlint, and that Adamantite curates the rules.

## The patch lane

`@effect/tsgo` does not publish a `jsPlugins` package. Its rules are native type-aware
`effecttsgo/*` rules. They exist only after `effect-tsgo patch --oxlint --typescript`
replaces the Oxlint binding, `oxlint-tsgolint`, the Oxlint `.d.ts`, and the `tsc` binary in
`node_modules` with the builds that `@effect/tsgo` ships. Without the patch, Oxlint stops with
`Unknown plugin: 'effecttsgo'`. The patch replaces each file and does not write through pnpm
hard links, so the global pnpm store stays unchanged.

`@effect/tsgo` can also report its diagnostics in `tsc`, or in a separate
`effect-tsgo diagnostics` run. The separate run type-checks the project a second time, and
`tsc` is not part of `adamantite check`. Oxlint already type-checks the project through
`typeAware` and `typeCheck`, so the rules cost no second pass there. On this repository the
Oxlint run with the rules took 3 s.

The patch must run again after each install of Oxlint, oxlint-tsgolint, TypeScript, or
`@effect/tsgo`, because the package manager restores the original binaries. A named install
changes one package without the others, so the trigger is any install, not an install of
`@effect/tsgo`. Upstream uses the `prepare` script for this. npm and pnpm run the root
`prepare` script after a bare install (`npm install`, `npm ci`, `pnpm install`), but not after
a named one (`npm install -D <package>`, `pnpm add -D <package>`). We tested both on npm 11.19
and pnpm 12.6. `adamantite update` runs a named install, so the `prepare` script alone left
Oxlint unpatched after an update (#486). So the managed plugin manages more than its package:

- `defineManagedPlugin` takes an optional `prepare` step. While the plugin applies,
  `adamantite prepare` runs it, and `init` and `update` run it after they install packages.
  The `@effect/tsgo` step runs the installed `effect-tsgo` executable from its `bin` entry with
  Node. It does not run the `prepare` script, so the two cannot call each other, and other
  commands in that script do not run during `update`.
- The `prepare` script must run `adamantite prepare`. `init` adds the script, or adds
  `&& adamantite prepare` to the end of an existing one, as upstream's `setup` command does.
  Doctor reports a `prepare` script that does not run it. Users' `package.json` names only the
  Adamantite command, so Adamantite owns the patch flags.
- `tsconfig.json` must have `{ "name": "@effect/language-service", "diagnostics": false }`
  in `compilerOptions.plugins`. The patched `tsc` gives editors Effect quick fixes,
  refactors, and hovers. `diagnostics: false` stops `tsc` and the editor from repeating each
  Oxlint report. The Oxlint rules read their options, such as `allowedUnstableApis`, from
  the same entry. In a monorepo, doctor gives guidance instead of a finding, as the tsconfig
  integration does.
- Knip reports `@effect/language-service` as an unlisted dependency, because no package has
  that name. The analyze preset exports `ignoreDependencies.effect`, `init` sets it, and
  doctor requires it while `oxlint.config.ts` imports the preset.

`@effect/tsgo` ships patched binaries only for some Oxlint, oxlint-tsgolint, and TypeScript
versions. A test asserts that the pinned versions each have an artifact in
`@effect/tsgo-<platform>/artifacts/`. Thus, a bump of one of those pins fails until a
compatible `@effect/tsgo` release is pinned too.

## Curation

`@effect/tsgo` 0.48.0 has 120 rules in four categories. A rule is in the preset only when all
of these conditions are true:

1. It reports Effect code. It does not ban a platform API in code that is not Effect code,
   such as `async-function`, `new-promise`, `node-builtin-import`, or the variants of
   `global-date` and `process-env` for code outside Effect. The `-in-effect` variants are in
   the preset: inside Effect code, `Clock`, `Random`, and `Config` let tests control time,
   randomness, and configuration.
2. No rule that Adamantite already enables reports the same defect. `unnecessary-arrow-block`
   repeats `arrow-body-style`. `strict-boolean-expressions` is a general TypeScript rule, so
   the core or strict preset decides it.
3. It does not depend on the project layout or on library-authoring choices.
   `strict-effect-provide` needs the entry points of the project, `deterministic-keys` reads
   key patterns based on `src/`, and `missing-pipeable-signature` is for library APIs.
4. It applies to Effect v4. `missing-effect-service-dependency` checks `Effect.Service`, which
   exists only in v3.

`missed-pipeable-opportunity` and `new-schema-class` are style preferences that report no
defect, so they are not in the preset. All the other correctness, anti-pattern, and style
rules are in the preset, including `any-unknown-in-error-context` and
`unsafe-effect-type-assertion`, which upstream turns off by default. Every enabled rule is
`"error"`, as in the other presets.

## Consequences

- A target project that adds the preset by hand must install `@effect/tsgo`, add
  `adamantite prepare` to `prepare`, and add the tsconfig entry. Doctor reports each part.
- A production-only install (`npm ci --omit=dev`, `pnpm install --prod`) runs `prepare` but
  does not install Adamantite, so it fails with `adamantite: not found`. Husky's
  `"prepare": "husky"` and upstream's `"prepare": "effect-tsgo patch"` behave the same way. We
  document `--ignore-scripts` for those installs and do not add a guard. A guard would make
  the script long and could hide real patch failures, and the failure is loud, happens at
  build time, and needs one flag to fix.
- A named install that the user runs, such as `npm install -D oxlint@x`, leaves the binaries
  unpatched. The project is then off its pins, so doctor reports the drift, and `update`
  repairs it.
- `unstable-api-usage` and `experimental-api-usage` are errors. A project that uses an
  unstable module on purpose, such as `effect/cli`, lists it in `allowedUnstableApis`.
- The preset test asserts that every enabled rule exists in `@effect/tsgo`, and that every
  upstream rule is either enabled or listed as excluded. A new upstream rule fails the test
  until we decide on it.
- Upstream owns rule behavior, so the rules have no per-rule fixtures. One real Oxlint run
  confirms that the patched binaries load the rules.
- Adamantite uses the preset itself. Its `tsconfig.json` allows `effect/Arbitrary`,
  `effect/cli`, and `effect/process`.
