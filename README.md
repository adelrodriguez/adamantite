<p align="center">
  <h1 align="center">💠 Adamantite</h1>
  <p align="center">
    <strong>Opinionated code-quality tooling for modern TypeScript projects.</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/v/adamantite.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/dm/adamantite.svg" alt="npm downloads">
  </a>
  <a href="https://github.com/adelrodriguez/adamantite/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/adelrodriguez/adamantite.svg" alt="license">
  </a>
</p>

Adamantite provides one CLI and a set of presets for linting, formatting, type checking,
dependency analysis, and monorepo checks. It configures Oxlint, Oxfmt, TypeScript, Knip,
and Sherif so humans and coding agents can use the same project workflow.

---

## Features

- **Fast checks**: Run Oxlint and Oxfmt on the Oxc toolchain.
- **Strict defaults**: Use opinionated lint and TypeScript presets without assembling a
  configuration from scratch.
- **Optional presets**: Add rules for different needs — frameworks like React, Next.js,
  and Vue, test runners like Jest and Vitest, Node.js, and stricter opt-in rule sets.
- **Project setup**: Create package scripts, configuration files, editor settings, and CI
  through an interactive or non-interactive initializer.
- **Setup maintenance**: Assess managed integrations with `doctor`, update managed
  dependencies, and give humans or agents repair instructions.
- **Workspace checks**: Find unused code with Knip and dependency inconsistencies with
  Sherif.
- **Agent guidance**: Add a managed Adamantite section to `AGENTS.md`.

## Quick start

Run the initializer from the root of a TypeScript project:

```sh
npx adamantite init
```

The interactive setup lets you choose package scripts, presets, TypeScript, editors, CI,
and agent guidance. After setup, use the scripts written to `package.json`:

```sh
bun run check
bun run fix
bun run analyze
```

Use the equivalent `adamantite` commands directly when the project does not have managed
scripts:

```sh
adamantite check
adamantite fix
adamantite analyze
```

## Non-interactive setup

Use `--non-interactive` to configure a project entirely from flags. Specify at least one
`--script`. Repeat `--script`, `--preset`, and `--editor` to select multiple values.

```sh
npx adamantite init \
  --non-interactive \
  --script check \
  --script fix \
  --script analyze \
  --preset react \
  --editor vscode \
  --typescript \
  --install-extensions \
  --github-actions \
  --agents
```

Available setup values:

- Scripts: `check`, `fix`, and `analyze`. In a detected monorepo, `analyze` also installs
  Sherif.
- Presets: `react`, `react-strict`, `react-doctor`, `tanstack`, `nextjs`, `vue`, `effect`,
  `jest`, `vitest`, `node`, `strict`, `antislop`, and `shadcn`. `react-doctor` requires `react`.
- Editors: `vscode` and `zed`.

Presets and TypeScript require the `check` or `fix` script. Editor extension installation
requires an editor. GitHub Actions requires a compatible script and a supported package
manager. Omitted boolean flags are disabled.

Existing package scripts whose commands differ from Adamantite's are kept and reported
instead of being replaced. The interactive initializer asks before overwriting them; in
non-interactive mode, pass `--overwrite-scripts` to replace them. To keep custom flags,
forward them to the Adamantite command after `--`, e.g.
`adamantite analyze -- --directory packages/app`.

In a detected monorepo, TypeScript setup does not write a root `tsconfig.json`, because a
catch-all root config makes TypeScript treat all packages as one project. Adamantite
prints guidance instead: add `"extends": "adamantite/typescript"` to each package's
`tsconfig.json` or to a shared base config.

## Commands

Run `adamantite --help` or `adamantite <command> --help` for the complete CLI reference.

### `adamantite check`

Find formatting, lint, and type errors without changing files:

```sh
adamantite check
adamantite check src
```

Use `--only` to run one stage. Arguments after `--` go to that stage, and to Oxlint when
both run:

```sh
adamantite check --only lint
adamantite check --only format
```

### `adamantite fix`

Apply safe Oxlint fixes, then format the files with Oxfmt. Suggested and dangerous fixes require explicit flags:

```sh
adamantite fix
adamantite fix --suggested
adamantite fix --dangerous
adamantite fix --all
```

Use `--only` to run one stage. Arguments after `--` go to that stage, and to Oxlint when
both run:

```sh
adamantite fix --only lint
adamantite fix --only format
```

### `adamantite analyze`

Find unused dependencies, exports, and files with Knip. In a detected monorepo, `analyze`
first finds dependency consistency problems with Sherif. The `--fix` option can remove
unused files, so review its effect before use.

```sh
adamantite analyze
adamantite analyze --strict
adamantite analyze --fix
adamantite analyze --only unused
adamantite analyze --only monorepo --fix -- --select highest
```

- The `monorepo` stage (Sherif) runs first, and only in a detected monorepo. The `unused`
  stage (Knip) always runs.
- Without `--fix`, both stages run and the exit code comes from the first failure. With
  `--fix`, a Sherif failure skips Knip, because Knip must not remove code against a
  dependency graph that Sherif did not repair.
- `--fix` applies to each stage that runs. `--strict` applies to Knip only.
- `--only monorepo` or `--only unused` runs one stage. `--only monorepo` fails outside a
  monorepo and with `--strict`.
- Arguments after `--` go to Knip, or to the stage that `--only` selects.
- `analyze` runs Sherif without flags. Put project exceptions in the `sherif` field of the
  root `package.json`, which Sherif reads. The keys are the Sherif CLI options in camelCase:
  `ignoreDependency`, `ignoreRule`, `ignorePackage`, `select`, `noInstall`, and
  `failOnWarnings`. For example: `"sherif": { "ignoreDependency": ["tailwindcss"] }`.
- A Sherif fix that must choose between versions prompts in a terminal. Without a terminal,
  set `"sherif": { "select": "highest" }` in the root `package.json`, or run
  `adamantite analyze --only monorepo --fix -- --select highest`.
- Use `--fix` locally, not in CI. Sherif refuses to fix in a CI environment (for example when
  `CI` is set), so `analyze --fix` fails there in a monorepo. CI runs `adamantite analyze`
  without `--fix`.

### `adamantite doctor`

Assess every Adamantite-managed integration. Doctor is read-only. Each finding describes
the current state, the goal state, and how to verify the repair.

```sh
adamantite doctor
```

In an interactive terminal, Doctor presents each finding as formatted text and offers to
hand off to an installed coding agent, or to copy one combined Markdown repair prompt. A
handoff starts the selected agent CLI in the terminal seeded with that same Markdown
repair prompt; the agent edits the project under its own permission and trust flow. When
the agent session ends, Doctor reassesses and exits 0 only when no findings remain.
Doctor detects installed agents by probing each supported CLI — Claude Code (`claude`),
Codex (`codex`), Cursor (`cursor-agent`), Gemini CLI (`gemini`), Grok Build (`grok`),
and OpenCode (`opencode`) — and lists only the ones found on `PATH`. OpenCode pre-fills
its input with the seed prompt, so that handoff needs one Enter press to start.

A coding agent can also run `adamantite doctor` in the target project to receive Markdown
directly. In a non-interactive run, Doctor prints the combined repair prompt and exits 1
when findings remain. If only assessment warnings remain, Doctor prints a Markdown
warning report and exits 0.

### `adamantite update`

Update Adamantite-managed dependencies, then report any setup findings:

```sh
adamantite update
adamantite doctor
```

`update` exits 0 when dependency updates succeed, even if doctor findings remain. Use
`adamantite doctor` as the CI gate. After it installs packages, `update` patches Oxlint and TypeScript again for
[the effect preset](#the-effect-preset).

### `adamantite prepare`

Patch Oxlint and TypeScript for [the effect preset](#the-effect-preset). The `prepare`
script in `package.json` runs it after each install:

```json
{ "scripts": { "prepare": "adamantite prepare" } }
```

Without the effect preset, `prepare` does nothing and exits 0. If the patch fails, `prepare`
fails, so the install fails.

### Pass arguments to underlying tools

Commands that invoke Knip, Oxlint, Oxfmt, or Sherif forward arguments after `--`:

```sh
adamantite analyze --strict -- --directory packages/app
adamantite check src -- --deny-warnings
adamantite analyze --only monorepo -- --ignore-package package-a
```

Package managers consume one separator, so package scripts need a second one:

```sh
bun run analyze -- -- --directory packages/app
npm run analyze -- -- --directory packages/app
```

`init`, `doctor`, and `update` do not forward arguments because they do not invoke one
underlying CLI.

## Presets

Adamantite publishes configuration that can also be consumed directly:

| Export                         | Purpose                                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adamantite/lint`              | Core Oxlint rules.                                                                                                                                                                                                                                                                     |
| `adamantite/lint/react`        | React, JSX accessibility, and performance.                                                                                                                                                                                                                                             |
| `adamantite/lint/react-strict` | Opinions for React feature code: no state, effect, or memoization hooks outside hook modules. See [the react-strict preset](#the-react-strict-preset).                                                                                                                                 |
| `adamantite/lint/react-doctor` | Curated [React Doctor](https://github.com/millionco/react-doctor) rules for React state and effect misuse. See [the react-doctor preset](#the-react-doctor-preset).                                                                                                                    |
| `adamantite/lint/tanstack`     | Opinions for [TanStack Query](https://tanstack.com/query) with route loaders: queries defined once with `queryOptions()`, and no query data copied into state. See [the tanstack preset](#the-tanstack-preset).                                                                        |
| `adamantite/lint/nextjs`       | Next.js rules.                                                                                                                                                                                                                                                                         |
| `adamantite/lint/vue`          | Vue rules.                                                                                                                                                                                                                                                                             |
| `adamantite/lint/effect`       | Curated [@effect/tsgo](https://github.com/Effect-TS/tsgo) rules for Effect misuse, such as effects that never run and unhandled errors. See [the effect preset](#the-effect-preset).                                                                                                   |
| `adamantite/lint/node`         | Node.js rules.                                                                                                                                                                                                                                                                         |
| `adamantite/lint/jest`         | Jest rules.                                                                                                                                                                                                                                                                            |
| `adamantite/lint/vitest`       | Vitest rules.                                                                                                                                                                                                                                                                          |
| `adamantite/lint/strict`       | Framework-neutral opinions: no deep or wide destructuring, and no type assertions outside tests. See [the strict preset](#the-strict-preset).                                                                                                                                          |
| `adamantite/lint/antislop`     | Vendored [anti-slop](https://github.com/dmmulroy/anti-slop) rules that reject low-evidence, low-signal patterns. Also turns off `typescript/consistent-indexed-object-style` and `unicorn/no-immediate-mutation` from the core preset, which conflict with these rules.                |
| `adamantite/lint/shadcn`       | [@shadcn/lint](https://github.com/shadcn-ui/lint) rules for Tailwind v4 design systems: no restyled components, raw colors, arbitrary values, inline styles, unknown classes, or unreadable class expressions. shadcn/ui is not required. See [the shadcn preset](#the-shadcn-preset). |
| `adamantite/format`            | Oxfmt configuration.                                                                                                                                                                                                                                                                   |
| `adamantite/analyze`           | Knip configuration. The `ignoreDependencies` named export groups suggested ignore lists; `init` sets `ignoreDependencies.monorepo` in a monorepo and `ignoreDependencies.effect` with the effect preset.                                                                               |
| `adamantite/typescript`        | Strict TypeScript configuration for TS 7+.                                                                                                                                                                                                                                             |

When consuming the lint presets directly, hoist the core preset's ignore patterns onto the
root config. Oxlint does not merge `ignorePatterns` from extended configs, so without the
hoist, dependencies, build output, and generated code are only skipped when your
`.gitignore` happens to cover them:

```ts
import { defineConfig } from "oxlint"
import core from "adamantite/lint"

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
})
```

Configs generated by `adamantite init` include this automatically.

### The react-strict preset

`adamantite/lint/react-strict` keeps state and side effects out of React feature code. Use
it together with `adamantite/lint/react`. It needs no extra package: the rules come from
Adamantite's own Oxlint plugin, which ships inside the package.

`adamantite/no-react-state-hooks` reports calls to `useState`, `useReducer`, `useEffect`,
`useLayoutEffect`, `useSyncExternalStore`, `useMemo`, and `useCallback` imported from
`react`, including aliased imports and `React.useState(...)`. Each message tells what to do
instead: derive state from loader data or URL params, move side effects to loaders, actions,
or event handlers, and let the React Compiler memoize. For the opinions that do not depend
on React, add [the strict preset](#the-strict-preset).

Hooks stay allowed in hook modules: files that match `**/use[A-Z]*.{ts,tsx}`, `**/use-*.{ts,tsx}`, or `**/hooks/**`, such as `useCart.ts`
or `use-cart.ts`. A file such as `userProfile.tsx` is feature code.
Globs match paths relative to the working directory. Set `allow` to use another layout, and
`hooks` to change the list of reported hooks:

```ts
import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import react from "adamantite/lint/react"
import reactStrict from "adamantite/lint/react-strict"

export default defineConfig({
  extends: [core, react, reactStrict],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "adamantite/no-react-state-hooks": [
      "error",
      { allow: ["src/state/**", "**/use[A-Z]*.{ts,tsx}"], hooks: ["useState", "useEffect"] },
    ],
  },
})
```

Each option replaces its default list.

### The react-doctor preset

`adamantite/lint/react-doctor` reports specific misuse of React state and effects. Use it
together with `adamantite/lint/react`. It needs the `oxlint-plugin-react-doctor` package.
`adamantite init` installs the pinned version when you select the preset, and
`adamantite doctor` and `adamantite update` keep it on that version. If you add the preset
by hand, install `oxlint-plugin-react-doctor` as a devDependency too.

The plugin exports more than 900 rules. The preset enables only rules that run on one file
and that the native `react`, `react-hooks`, `jsx-a11y`, and `unicorn` rules do not already
report. Examples are an effect that does the work of an event handler (`no-effect-event-handler`), data fetched in an effect
(`no-fetch-in-effect`), and state changed in place (`no-direct-state-mutation`). The
TanStack Query and TanStack Start rules are not in this preset. See
[ADR 0005](docs/adr/0005-curate-react-doctor-rules.md) for the criteria.

The preset works together with `adamantite/lint/react-strict`. React Doctor rules report
specific misuse, and `react-strict` bans the hooks in feature code. Some React Doctor rules
skip test files and fixtures by path, such as `__tests__/` and `*.test.tsx`.

`oxlint-plugin-react-doctor` has a modified MIT license. It needs written permission from
the copyright holder to use the software as machine learning training data, or to sell it
as a hosted product. Read the
[license](https://www.npmjs.com/package/oxlint-plugin-react-doctor?activeTab=code) before
you select the preset.

### The tanstack preset

`adamantite/lint/tanstack` holds opinions for TanStack Query (`@tanstack/react-query`) in
apps that preload queries in route loaders, such as TanStack Router and TanStack Start apps.
Like `react-strict`, it needs no extra package.

- `adamantite/query-from-loader` reports `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`,
  and `useSuspenseInfiniteQuery` calls that take a plain options object or a `queryOptions()`
  call made inside a function. Define each query once with `queryOptions()` at module scope
  or in an exported factory such as `userQuery(id)`, preload it in the route loader with
  `queryClient.ensureQueryData()`, and pass the same options to the hook. For the infinite
  hooks, use `infiniteQueryOptions()` and `queryClient.ensureInfiniteQueryData()`. The rule
  looks through type-only wrappers such as `as const` and `satisfies`. Then a route with
  `preload="intent"` renders from the cache without a request waterfall. An object that
  spreads shared options, such as `{ ...userQuery(id), select }`, stays allowed.
- `adamantite/no-query-data-in-state` reports `useState` calls whose initial value comes from
  the data of a query in the same component, such as `useState(query.data)` or
  `useState(() => data.user)`. The copy stops updating when the query refetches. Read the
  value from the query result, and keep only the user's edits in state.

`query-from-loader` checks one file at a time. It cannot prove that a loader preloads the
options, so it moves queries toward shared definitions but does not guarantee the preload.
The `react-doctor` preset reports other query misuse, such as refetches from effects and
mutations that do not invalidate queries. See
[ADR 0008](docs/adr/0008-tanstack-query-options-from-loaders.md).

### The effect preset

`adamantite/lint/effect` reports misuse of [Effect](https://effect.website), such as an
effect that is neither yielded nor assigned (`floating-effect`), an unhandled error or
requirement (`missing-effect-error`, `missing-effect-context`), and a combinator with a
simpler replacement (`catch-all-to-map-error`). The rules come from
[@effect/tsgo](https://github.com/Effect-TS/tsgo), the Effect Language Service for
TypeScript-Go, and need Oxlint's type-aware mode.

The rules are not a JavaScript plugin. They exist only after `effect-tsgo patch --oxlint
--typescript` replaces the Oxlint, oxlint-tsgolint, and TypeScript binaries in
`node_modules`. Without the patch, Oxlint stops with `Unknown plugin: 'effecttsgo'`. Each
install of one of those packages restores the original binaries, so the patch must run again
after it. Adamantite runs it in these places:

- `adamantite prepare`, which the `prepare` script runs after a bare install, such as
  `npm install`, `npm ci`, or a fresh clone in CI.
- `adamantite init` and `adamantite update`, after they install packages. A named install,
  such as `npm install -D oxlint@1.86.0`, does not run the `prepare` script. If you change one
  of those versions yourself, doctor reports the version drift, and `adamantite update`
  installs the pinned version and patches it.

When you select the preset, `adamantite init` does these steps:

- Installs the pinned `@effect/tsgo` and runs the patch.
- Adds `"prepare": "adamantite prepare"` to `package.json`. If the project already has a
  `prepare` script, init rewrites it as `adamantite prepare && (<existing>)`. A command such as
  `cd ..` then cannot move the patch out of the project, and a fallback such as `|| true`
  cannot hide a failed patch.
- Adds `{ "name": "@effect/language-service", "diagnostics": false }` to
  `compilerOptions.plugins` in `tsconfig.json`. Editors that use the workspace TypeScript
  get Effect quick fixes, refactors, and hovers. Oxlint reports the diagnostics, so the
  language service does not report them a second time.
- Sets `ignoreDependencies.effect` in `knip.config.ts`, because no package has the name
  `@effect/language-service`.

`adamantite doctor` reports each missing part, and `adamantite update` keeps
`@effect/tsgo` on its pinned version. Each `@effect/tsgo` release supports only some Oxlint,
oxlint-tsgolint, and TypeScript versions, so Adamantite moves the pins together.

A production-only install, such as `npm ci --omit=dev` or `pnpm install --prod`, still runs
the `prepare` script, but it does not install Adamantite, so the install fails with
`adamantite: not found`. Add `--ignore-scripts` to those installs. Nothing in a production
install needs the patch.

The rules read their options from the tsconfig entry. For example, `unstable-api-usage`
reports each use of an API marked `@stability unstable`. To allow a module on purpose, list
it in `allowedUnstableApis`:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "diagnostics": false,
        "allowedUnstableApis": ["effect/cli"],
      },
    ],
  },
}
```

The preset enables only rules that report Effect code. It does not ban platform APIs, such
as `Date.now()` or `process.env`, in code that is not Effect code. Inside Effect code, it
reports them, because `Clock`, `Random`, and `Config` let tests control them. See
[ADR 0007](docs/adr/0007-effect-preset-patches-oxlint.md) for the criteria.

### The strict preset

`adamantite/lint/strict` holds framework-neutral opinions. Use it with any other preset. Like
`react-strict`, it needs no extra package.

- `adamantite/no-overzealous-destructuring` reports destructuring patterns nested more than
  `maxDepth` levels deep (default 2), such as `const { data: { user: { name } } } = query`,
  and object patterns that take more than `maxProperties` properties (default 5). A rest
  element does not count. Keep the object and read its members, or split the pattern.
- `typescript/consistent-type-assertions` bans type assertions. `as const` stays allowed,
  and test files (`*.test.*`, `*.spec.*`, and `__tests__/`) keep the core preset's setting.

Set `maxDepth` and `maxProperties` to change the destructuring limits:

```ts
import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import strict from "adamantite/lint/strict"

export default defineConfig({
  extends: [core, strict],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "adamantite/no-overzealous-destructuring": ["error", { maxDepth: 1, maxProperties: 3 }],
  },
})
```

### The shadcn preset

`adamantite/lint/shadcn` needs Tailwind v4 and the `@shadcn/lint` package. `adamantite init`
installs the pinned version when you select the preset, and `adamantite doctor` and
`adamantite update` keep it on that version. If you add the preset by hand, install
`@shadcn/lint` as a devDependency too. The plugin finds your components and theme
through `components.json`. Without that file it looks for components in `components/ui`
or `src/components/ui` and discovers the stylesheet that imports Tailwind. When your
components live elsewhere, set `settings.shadcn.ui`:

```ts
import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import shadcn from "adamantite/lint/shadcn"

export default defineConfig({
  extends: [core, shadcn],
  ignorePatterns: core.ignorePatterns,
  settings: { shadcn: { ui: "@/ds" } },
})
```

The preset allows layout classes such as `mt-4` and `w-[320px]` on components, and turns
off `no-restyle`, `no-arbitrary-values`, and `require-static-classes` under
`**/components/ui/**`, where components own their appearance. Add the same override for
another component directory. See the
[@shadcn/lint documentation](https://github.com/shadcn-ui/lint#settings) for settings,
contracts, and custom messages.

## Requirements and boundaries

- Adamantite requires Bun 1.0 or later when run with Bun, or Node.js 22.19 or later when
  run with Node.js.
- Adamantite requires TypeScript 7 or later. List `typescript` as a dependency in your own
  `package.json`. Do not rely on the copy that a package manager installs for Adamantite's
  peer dependency: npm cannot add or update a managed plugin such as `@shadcn/lint` in a
  project that has no `typescript` entry of its own.
- This repository uses pnpm and Node.js for development, but the CLI can configure
  projects that use Bun, Deno, npm, pnpm, or Yarn where the selected integration supports
  them.
- Adamantite manages recognized package scripts and supported configuration shapes. It
  reports custom configurations that require manual work instead of overwriting them.
- `fix`, `analyze --fix`, `init`, and `update` can change project files. Doctor is read-only.

## Agent skill

Install the first-party Adamantite skill to teach coding agents how to initialize, assess,
repair, and update a project:

```sh
npx skills add adelrodriguez/adamantite --list
npx skills add adelrodriguez/adamantite --skill adamantite
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow. Contributors should
also read the [domain glossary](CONTEXT.md) and [architecture reference](docs/architecture.md).

## License

Adamantite uses the [MIT License](LICENSE).

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)
