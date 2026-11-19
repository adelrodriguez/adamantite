# adamantite

## 0.48.0

### Minor Changes

- [#911](https://github.com/adelrodriguez/adamantite/pull/911) [`858e371`](https://github.com/adelrodriguez/adamantite/commit/858e37158396ebbe3b2e2ecd34e437d29c39a666) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Check `require()`, `import x = require()`, and fixed `import()` sources in `adamantite/layers` and `adamantite/import-owners`

  Both rules checked an `import()` only when its source was a plain string, and did not check CommonJS or TypeScript import-equals imports. Each of these imports could cross a layer or reach a restricted module without a report. Both rules now check:

  - `import()` with a template that has no expression, such as ``import(`../high/api.ts`)``.
  - `import()` with a string inside `as`, `satisfies`, `!`, or `<T>` assertions, such as `import("../high/api.ts" as string)`.
  - `require("../high/api.ts")`, unless the file declares its own `require`.
  - `import api = require("../high/api.ts")`, `export import api = require(...)`, and `import type api = require(...)`.

  A source that only running the code gives, such as a variable or a template with `${}`, is still not checked. `require()` and `import x = require()` resolve with the `require` condition of a package's `exports` and `imports`. In `adamantite/layers`, `import type x = require()` follows `ignoreTypes`. In `adamantite/import-owners`, `require()` and `import x = require()` reach every export of the module, as `import()` does, so they are reported when the option restricts only some names.

  A project can get new reports where these imports cross a boundary. Move the import to an allowed layer or to an owner, as for a static import.

- [#942](https://github.com/adelrodriguez/adamantite/pull/942) [`4d35430`](https://github.com/adelrodriguez/adamantite/commit/4d3543020ebd400de3f140b3cc6d6a618a45560c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fail `adamantite check` when the lockfile records another Adamantite version than the project installs

  After an update of the `adamantite` package, the managed packages, the managed files, and the Adamantite skill stay at the old version until `adamantite update` runs. `adamantite check` now runs its stages as before, then fails with a line that names the version in `.adamantite/adamantite-lock.json`, the installed version, and the repair. `adamantite doctor` reports the same state as the `setup-outdated` finding, or as `setup-ahead` when a newer Adamantite wrote the lockfile.

  The comparison uses the Adamantite that the project installs, so a CLI from another install, such as `npx`, judges the project as the project's own CLI does. A project without a lockfile, or one that installs no Adamantite, passes this step. `update` writes the lockfile again with the installed version, also when no managed file changes.

  To migrate, run `adamantite update` after each update of the `adamantite` package, and commit the changes. When the check says that a newer Adamantite wrote the lockfile, install the dependencies instead, because `update` with the older version would bring the setup back to it.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report more conditional spreads that omit properties in `quality/no-conditional-empty-object-spread`

  The rule now reports `...(name && { name })`, a branch of `undefined`, `null`, or `void 0`, an empty object under `satisfies` or `as`, an empty branch in a nested conditional, and a `const` that holds `{}`. A `const` counts as empty only when code does nothing with it but spread it, because a property write or a call such as `Object.assign(fallback, values)` can fill it. It also reports the same pattern in a JSX spread attribute, such as `<div {...(ok ? { title } : {})} />`. The message now says that one branch adds nothing, because that branch is not always an empty object.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read named interfaces, heritage clauses, and finite key sets in the dictionary rules

  `quality/no-unsafe-dictionary-type` and `quality/no-known-value-widening` now treat a named interface like a named alias, and a finite key set like a closed object.

  `quality/no-unsafe-dictionary-type`:

  - Reports `interface A extends Record<string, unknown>`, `class A implements Record<string, unknown>`, and a type alias or interface whose default type argument makes it an unsafe dictionary, such as `type Bag<T = unknown> = Record<string, T>`.
  - Reads `globalThis.Record<string, unknown>` as the built-in `Record`, which Effect code writes when `import { Record } from "effect"` hides the global type.
  - Reads a named interface at a use with type arguments, as it reads an alias. `interface Bag<V> extends Record<string, V> {}` used as `Bag<unknown>` is reported, and `Bag<number>` is not. A plain use such as `const bag: Bag` is not reported again, because the interface declaration reports itself.
  - Reports a named dictionary such as `type LogFields = Record<string, unknown>` once, at its declaration, also when another type alias uses it. Before, `type Logger = { info: (event: LogFields) => void }` got one report for each method. An alias whose whole body is the dictionary, such as `type Other = LogFields`, still reports, because it gives the dictionary another name. A logger or tracer that accepts open fields can name its field bag once and suppress the rule at that declaration with a reason, as the strict preset section of the README shows.
  - No longer reports `Record<"a" | "b", unknown>` or a mapped type over literal keys, because `{ a: unknown; b: unknown }` passes. It still reports a key type that it cannot resolve, such as an imported type.
  - No longer reports `Record<string, unknown>` in a conditional type test, such as `T extends Record<string, unknown> ? A : B`, or as the filter of the built-in `Extract` and `Exclude`. Those positions ask whether a type is a plain object, and `object` gives a different answer for interfaces and arrays.

  `quality/no-known-value-widening`:

  - Reports a known value widened to a named interface with an index signature, such as `interface ScoreMap { [name: string]: number }`, as it does for `type Scores = Record<string, number>`. A generic interface passes its type arguments to the types it extends, so `interface Dict<K extends string, V> extends Record<K, V>` is open as `Dict<string, number>` and closed as `Dict<"a" | "b", number>`. The message now asks for a named owner contract with known keys.
  - No longer calls an inline mapped type over literal keys, such as `{ [K in "a" | "b"]: number }`, an open dictionary.
  - Reports a type guard or assertion call only when its argument is a literal or object value, such as `isString("known")`, or a `const` that holds one. TypeScript narrows a declared binding at the call, so a guard on a parameter typed `string | number` does not widen it.

  Both rules read the keys of a mapped type with an `as` clause from that clause. `{ [K in "seed" as string]: unknown }` is still an open dictionary. ``{ [K in Kind as `get${Capitalize<K>}`]: number }`` is closed when `Kind` is a finite set of literals. Any other `as` clause, such as an imported type or a template with `string`, counts as open.

- [#894](https://github.com/adelrodriguez/adamantite/pull/894) [`0f9a8ed`](https://github.com/adelrodriguez/adamantite/commit/0f9a8edf35c63cda50fae521bc65eca4803478c0) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop reporting migrations from earlier Adamantite versions in Doctor

  Doctor no longer reports these findings, and no longer reads the source of configs and rule files to find them. A config or rule file that still uses a retired name now fails to load, and Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed. Replace each retired name, and remove the leftover settings by hand:

  - "The shadcn preset was renamed to tailwind" (`tailwind-preset-migration`). Replace `adamantite/lint/shadcn` and `--preset shadcn` with `adamantite/lint/tailwind` and `--preset tailwind`.
  - "React Doctor rules now belong to react-strict" (`react-doctor-preset-migration`). Replace `adamantite/lint/react-doctor` and `--preset react-doctor` with `adamantite/lint/react-strict` and `--preset react-strict`. Keep the `react` preset and `oxlint-plugin-react-doctor`. The `react-doctor/*` rule names stay the same.
  - "The antislop rules now belong to strict" (`strict-preset-migration`). Replace `adamantite/lint/antislop` and `--preset antislop` with `adamantite/lint/strict` and `--preset strict`.
  - "Custom rules need migration to the current agent workflow" (`custom-rules-api-migration`) and "Custom rule `<file>` cannot load" (`custom-rule-cannot-load:<file>`). A config or rule file that imports the removed `adamantite/lint/custom` module or a name that `adamantite/rules` no longer exports fails to load, and so does a rule file with TypeScript that type stripping cannot erase, such as an `enum`. Import `custom` from `adamantite/rules`, and `definePlugin`, `defineRule`, and the authoring types from `adamantite/rules/plugin`. The Adamantite skill gives these repairs for the `oxlint-config-load-failure` finding.
  - "Legacy oxlint-tsgolint" (`legacy-oxlint-tsgolint`). Remove `oxlint-tsgolint` from `package.json`. Adamantite runs the type-aware rules on tsrs.
  - "Legacy Zed oxfmt settings" (`legacy-zed-oxfmt-settings`). Remove the oxfmt language server settings that an earlier Adamantite wrote to `.zed/settings.json`: `configPath: null`, `"fmt.experimental": true`, `typeAware: false`, and `unusedDisableDirectives: false`.

  Doctor also no longer looks for rules in `.adamantite/rules`, the default rules folder before `.adamantite/lint`. It checks only `.adamantite/lint` and the folders that `custom()` calls load. Move the rules to `.adamantite/lint`, or load the folder with `custom({ dir: ".adamantite/rules" })`.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Detect the package manager from `package.json` or a lockfile

  Adamantite now reads the package manager from the `packageManager` field of `package.json`, such as `pnpm@10.0.0`, or else from a lockfile: `bun.lock` or `bun.lockb`, `deno.lock`, `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`. It looks in the project folder and then in each folder above it. Without a `packageManager` field, a `yarn.lock` with the `__metadata` entry that Yarn 2 and later write selects modern Yarn, so a monorepo installs without the Yarn 1 `-W` flag. A `yarn.lock` with the `# yarn lockfile v1` header, or with neither, selects Yarn 1. It no longer detects a package manager from `deno.json`, `pnpm-workspace.yaml`, `.yarnrc.yml`, the `devEngines` field, or the command that started Adamantite, and it no longer detects package managers outside bun, deno, npm, pnpm, and yarn. Without a supported package manager, `adamantite init` fails with the `No package manager was found` error, and the GitHub Actions and `AGENTS.md` integrations write no package manager commands. Add a `packageManager` field or a lockfile to the project.

  Installs run the package manager directly, such as `pnpm add -D` or `npm install -D`, instead of through Corepack. A failed install shows the command line and what the package manager printed.

- [#819](https://github.com/adelrodriguez/adamantite/pull/819) [`224ecbe`](https://github.com/adelrodriguez/adamantite/commit/224ecbeb488518da8b64fcc7c1c977394684ff9a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Use Effect's prompts and console for the terminal, and exit 1 when `init` is cancelled

  Questions now show `? message ›`, and each answer shows `✔ message … answer`. Status lines start with a symbol, such as `✔ Dependencies installed.`, and no guide line runs at the left edge. Each step prints one line when it finishes, without a spinner. The error that ends a command goes to standard error.

  - The intro and outro headings print only when the command can prompt, so a run without a terminal, or `init --non-interactive`, prints none. Each outro starts with `✅`, such as `✅ Setup finished.` and `✅ No setup selected, so Adamantite made no changes.`. `adamantite update` no longer prints the `❌ Update failed` outro before an error.
  - A cancelled prompt in `adamantite init`, such as Ctrl-C, now exits 1 with the `CommandFailed` error, as a cancel in `doctor`, `harden`, and `update` does. Before, `init` printed `■ Setup was cancelled.` and exited 0. A script that runs `init` in a terminal and treats a cancel as success needs to accept exit code 1.
  - The scripts prompt of interactive `init` starts with the recommended `check` and `fix` scripts checked, so pressing Enter sets up Oxlint and Oxfmt. Before, Enter selected no script.
  - The editor prompt of `init` calls the `.vscode/settings.json` choice "Universal", because VS Code, Cursor, Windsurf, and other editors read that file. The highlighted choice shows the settings file that `init` creates. The `--editor vscode` flag does not change.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Let `quality/no-array-filter-map` report a reassigned variable with an array type

  The strict preset now reports adjacent `filter` and `map` calls on a `let` variable that has an array type annotation, such as `let values: number[] = []`, also after the code assigns a new value to it. The annotation keeps each value an array. A reassigned variable without an annotation is still allowed, because its new value can be an iterator.

- [#939](https://github.com/adelrodriguez/adamantite/pull/939) [`2f511d8`](https://github.com/adelrodriguez/adamantite/commit/2f511d8fa15f0481c6c88cdad051020a4e2b2c37) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Give `adamantite harden` a decisions record, so a later session does not propose again what you rejected

  After you answer a harden session, the coding agent appends lines to `.adamantite/decisions.jsonl`. The record is at the project root, which is the workspace root in a monorepo. It is a JSON Lines log, and Adamantite never writes it. Commit the record.

  ```jsonl
  {"session":"2026-03-14","head":"4f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"}
  {"id":"tests-beside-module","at":"2026-03-14","standard":"Test files sit beside the module that they test","decision":"rejected","reason":"Integration tests stay in tests/","follow":41,"break":7,"fixes":["1a2b3c4"]}
  ```

  A decision line records a candidate that you did not approve, or a decision that you made. It has the required keys `id`, `at`, `standard`, and `decision`, and the optional keys `reason`, `rule`, `scope`, `follow`, `break`, and `fixes`. The `decision` is `rejected`, `deferred`, `decided`, or `approved`. A decision is its `id` together with its `scope`, so one standard can have a decision for the project and another for a folder. A later line with the same `id` and the same `scope` replaces the earlier one, and an `approved` line ends that decision. An approved candidate gets no line, because its rule or instruction is the trace.

  A session line records one session that you answered. It has `session`, the date, `head`, the commit that `HEAD` named, and `scope`, the `--path` of the session. The prompt gives the agent the line to copy. A session with `--commits` records no `head`, so it does not move the start of later sessions. The README describes each key.

  Adamantite decodes the record:

  - The prompt has a "Decisions" section that shows the last decision of each `id` and `scope` on one line. The agent lists a candidate that matches a decision under "Also considered", unless it has evidence that is newer than the decision. To let harden propose a candidate again, delete its decision line.
  - With `--path`, the prompt leaves out the decisions of other folders.
  - The prompt lists each line that does not decode, with its line number, for the agent to repair. After a handoff, `harden` exits 1 when the session added such a line.
  - The agent now reads the fix commits after the common ancestor of `HEAD` and the commit of the last session line that covers the scope of the session. A line covers a scope when it has no `scope`, or when its `scope` is that folder or a parent of it. Without such a line, or when the repository does not have the recorded commit, the agent reads the last 200 commits as before. `--commits <n>` reads the last `n` commits in each case.
  - `harden --json` has `decisionsRecord`, with the `_tag` `Present` or `Missing`. A present record has its `decisions`, its `sessions`, and its `undecodableLines`. `harden --json` also has `head`, the commit that `HEAD` names, and `fixHistory`. It is `{ "_tag": "Last", "count": 200 }` for the default, `{ "_tag": "Requested", "count": 30 }` for `--commits 30`, or `{ "_tag": "Since", "boundary": "<hash>", "head": "<hash>", "session": "<date>" }`.

  The Adamantite skill tells agents to append to the record.

- [#944](https://github.com/adelrodriguez/adamantite/pull/944) [`7d31712`](https://github.com/adelrodriguez/adamantite/commit/7d31712ccb738f5740737990bc99ab7220bbc1c4) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - List links whose anchor matches no heading, and count TypeScript suppressions, in `adamantite harden`

  - The "Agent reach" section of the prompt lists each Markdown link whose anchor Adamantite could not match to a heading of its file, such as `docs/architecture.md#module-seams`. The match is a simple rule: the GitHub anchor of the heading as written, and of the heading without link targets, HTML tags, and emphasis underscores. A `{#id}` at the end of a heading and an HTML `id` count as anchors too. The rule can list a link that works, such as one to a heading with an image or an HTML entity, so the prompt tells the agent to open each target, decide whether the link is broken, and treat a broken one as a discovery gap. `harden` does not fail a session on such a link.
  - The "Suppressions" section counts the `@ts-expect-error`, `@ts-ignore`, and `@ts-nocheck` comments in the files that Oxlint lints, with their locations. It counts a comment only where TypeScript reads the directive, so a sentence that mentions `@ts-ignore` does not count. The prompt tells the agent that many `@ts-expect-error` comments with the same reason point to a type that is wrong at its source.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `--json` to `doctor`, `harden`, `init`, `update`, `rule ast`, and `rule try`, and run `init` from the flags without a terminal

  Each command prints one JSON document on standard output and writes its other lines on standard error. With `--json`, a command never asks a question and never starts an agent, and its exit codes stay the same. The Adamantite skill now tells agents to use `--json`.

  - `doctor --json` prints the `selection`, the applicable integrations, the `findings` with their `id`, `integration`, `title`, `currentState`, `goal`, `notes`, and `reference`, the `warnings`, and the `packageActions`.
  - `harden --json` prints the context of its prompt: the configs, rules folders, instructions, documentation, agent reach with its broken links and the links whose anchor matches no heading, the suppressions of each rule and of each TypeScript directive, override trials, scope, decisions record, and fix history.
  - `init --json` and `update --json` print the file writes, the script writes, the installs, and the lockfile write of the setup, and the assessment after it. `init --json` sets up from the flags without `--non-interactive`.
  - `rule ast --json` prints the file and its tree, and `rule try --json` prints the rule, the setting, and the reports of each case.

  `adamantite init` now asks for the selection only when standard input and standard output are both terminals. Without such a terminal, as in CI or when an agent runs it, `init` sets up from the flags as with `--non-interactive`, and reports a missing `--script` or `--typescript` instead of opening prompts.

- [#915](https://github.com/adelrodriguez/adamantite/pull/915) [`8f32d14`](https://github.com/adelrodriguez/adamantite/commit/8f32d1407875b513e245972e3827dba36e0d6aea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Warn about import layers that an Oxlint config states by hand

  `adamantite doctor` now warns when an Oxlint config turns on `no-restricted-imports` with `patterns` in two or more `overrides` entries, as a hand-written layer map does. Oxlint replaces the options that an earlier override set for the same files, so each override repeats the patterns of the ones before it. The `adamantite/layers` rule states the same layers in one layer map. The warning names the config, counts the overrides, and gives the steps to move them into layer maps. It tells you to keep each override that bans imports from another workspace package, because a layer map checks only the imports inside one package. Doctor checks the root config and the config of each workspace package, and counts overrides that a `.map()` callback builds. It is a warning, not a finding, so Doctor still exits 0.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read configs, disable comments, and syntax trees from the tools, instead of parsing source

  Doctor, `init`, `update`, `harden`, and `rule test` now load `oxlint.config.ts`, `oxfmt.config.ts`, `knip.config.ts`, and the Oxlint config of each workspace package with Node.js, in a separate process, and read the default export. They no longer parse the source, so a config can build its settings with spreads, variables, function calls, and shared packages. A config runs its own code when it loads, as it does when the tool loads it.

  - A preset counts when the loaded config applies it, also through a spread such as `{ ...analyze }` or through a shared config package. Each preset names itself under a symbol key that the tools ignore, so the project must install the Adamantite version that runs the command.
  - A config that Node.js cannot load gets the `invalid-oxlint-config`, `invalid-oxfmt-config`, or `invalid-knip-config` finding with the error that Node.js printed.
  - The Knip check reads the loaded `ignoreDependencies`, so an entry counts as a name or as a regular expression that matches it.
  - Custom rule discovery reads the rules folder, the plugin name, and the calling file of each `custom()` call that a loaded config reaches. A `dir` or a `name` that a variable sets now counts, and a `custom()` call in an imported module counts without import resolution. Doctor and `rule test` warn about a config that does not load, and no longer warn about an import that they cannot resolve or a `dir` or `name` that is not a string literal.
  - `harden --json` lists the configs that Node.js cannot load in `unloadedConfigs`, and the trials of `harden` read the overrides of the loaded config, so an override that a spread or a function adds also gets a trial.

  Doctor also runs Oxlint to load the lint configs. When a config fails to load, such as one that imports a preset that the installed Adamantite does not export, Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed, and exits 1. Before, Doctor only warned that it could not list the Oxlint files, and `adamantite check` failed without a finding. The finding and the Adamantite skill point to the changelog for the preset that replaces a removed one.

  `harden` now counts the disable comments that Oxlint parses, and `rule ast` prints the syntax tree that Oxlint gives rules. A small internal Oxlint plugin reports them, so both commands run the Oxlint of the project, and `rule ast` fails when the project has no Oxlint. `rule ast` prints the tree with `range`, `comments`, and `tokens` beside `start` and `end`, and without the link from a node to its parent. A `bigint` literal value prints as its digits. A file that Oxlint does not lint, such as a CSS file, fails with an error that says so. When Oxlint cannot read the comments, `harden` asks the agent to count them, as it does when Oxlint cannot list its files.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Let `testing/no-doubles` report mocks through a namespace import or a destructured method

  The strict preset now reports `vitest.vi.mock(...)` after `import * as vitest from "vitest"`, the same form for `@jest/globals`, and a mock method that the code destructures from `vi` or `jest`, such as `const { doMock } = vi`. It also follows `const` aliases of `vi`, `jest`, and their mock methods, and reads `globalThis.vi`. An import of `vi` from your own module, such as `import { vi } from "./helpers"`, is still allowed.

- [#929](https://github.com/adelrodriguez/adamantite/pull/929) [`0986672`](https://github.com/adelrodriguez/adamantite/commit/0986672a611deefb3da2088be071cf5158d5c5b0) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Turn on `curly`, `import/export`, and `unicorn/prefer-string-raw` in the core preset, and add `adamantite/require-effect-dependencies` to the react-strict preset

  These rules report code that passed before, so `adamantite check` can fail after you update.

  - `curly` reports an `if`, `else`, or loop body without braces, such as `if (done) return`. `adamantite fix` adds the braces. With the strict preset, run `adamantite fix` a second time, because the spacing rule then asks for a blank line after the new block, and Oxlint applies one pass of fixes.
  - `import/export` reports a name that a module exports twice, including a local export that hides a name of an `export *`. TypeScript does not report that case, and it does not check JavaScript files. Rename or remove one of the exports.
  - `unicorn/prefer-string-raw` reports a string that escapes a backslash, such as `"C:\\project"` or the regular expression source `"^\\S"`. `adamantite fix` writes it as a `String.raw` template, such as `` String.raw`C:\project` ``.
  - `adamantite/require-effect-dependencies` reports a call to `useEffect`, `useLayoutEffect`, or `useInsertionEffect` that passes no dependency array, or passes `undefined` or `null`, because React then runs the effect after every render. Pass the values that the effect reads, or `[]` when it reads none.

- [#857](https://github.com/adelrodriguez/adamantite/pull/857) [`77b2403`](https://github.com/adelrodriguez/adamantite/commit/77b24037b295dc381d5039bf866907f98e1911eb) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Move the Node.js lint rules into core

  Core now enables `node/handle-callback-err`, `node/no-exports-assign`, `node/no-mixed-requires`, `node/no-new-require`, and `node/no-path-concat`. The separate `adamantite/lint/node` preset and `--preset node` choice are removed. A config that still imports `adamantite/lint/node` fails to load, and Doctor reports the load error.

  Remove the Node preset import and its `extends` entry from `oxlint.config.ts`. Keep the core `adamantite/lint` preset and any `node/*` rule settings. Remove `--preset node` from init commands.

  Oxlint matches the name `require` in the mixed-declaration and constructor rules even when it names a local parameter. Rename those parameters to names such as `loadModule` and `Module`. The callback rule also reports a declaration parameter named `err`, which can be renamed to `error`. These upstream limitations remain tracked in [issue #843](https://github.com/adelrodriguez/adamantite/issues/843).

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report `Readonly<object>` and `object & {}` parameters, and name the fixes that work, in `quality/no-object-parameters`

  The rule now reports a parameter typed `Readonly<object>`, `NonNullable<object>`, or an intersection of `object` with `{}`, because each type accepts the same values as `object`. A local type named `Readonly` or `NonNullable` keeps its own meaning, and an intersection with a named type, such as `object & Owner`, still passes.

  The message now suggests a named domain type, `WeakKey` for a `WeakMap` or `WeakSet` key, or a generic `<T extends object>` that the signature uses again, such as in the return type. A generic with one use fails the core preset's `typescript/no-unnecessary-type-parameters`.

- [#842](https://github.com/adelrodriguez/adamantite/pull/842) [`f2e3d4a`](https://github.com/adelrodriguez/adamantite/commit/f2e3d4acb8e39a15bafc2c635f2663527b370594) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ship the strict and effect rules as first-party code under the `quality` and `quality-effect` namespaces

  This breaks rule settings and suppression comments that use `anti-slop/*` or `anti-slop-effect/*`. Replace those prefixes with `quality/` and `quality-effect/`, except `anti-slop/no-module-mocking`, which is now `testing/no-doubles` of the new `testing` plugin. Keep the rule severity, options, and suppression reasons.

  A config that still sets an `anti-slop/*` or `anti-slop-effect/*` rule fails to load, and Doctor reports the load error. `adamantite check` reports a suppression comment with an old name as an unused directive. Rename each one, run `adamantite check`, then run Doctor again.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Write each setup file whole as a managed file, and stop merging into files that you wrote

  `adamantite init` and `adamantite update` now write each setup file only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. A file that an earlier version wrote and nobody changed is replaced with the current version. A file that you changed is kept, and `adamantite doctor` reports each change that breaks the setup. When the setup no longer uses a file, `update` deletes it if nobody changed it. Adamantite no longer merges its settings into a file that you wrote, and no longer stops or prints a change to make by hand when the file has comments.

  These are the managed files, with what Doctor checks in a file that you changed:

  - `oxlint.config.ts` lists its imports in the order that Oxfmt sorts them, and wraps `extends` when it passes 100 characters, so `adamantite fix` leaves it unchanged. Doctor reports a lint preset that the lockfile selects and no Oxlint config of the project applies, with the new `missing-lint-preset` finding. A preset counts as applied in `extends`, in an `overrides` entry that spreads its `rules`, as the jest and vitest presets show, and in the Oxlint config of a workspace package. Doctor also requires the plugin package of a preset that only a workspace package config applies.
  - `oxfmt.config.ts` lists its imports in the order that Oxfmt sorts them. Doctor reports a config that no longer uses `adamantite/format`.
  - `knip.config.ts` gets the ignore lists of the recorded selection, so a project that selects the `effect` preset gets the `@effect/language-service` entry on the first `init`. Doctor reports a config that no longer uses `adamantite/analyze` or misses an ignore list that the setup needs. The `missing-knip-config` finding now says to run `adamantite update`.
  - `tsconfig.json` extends the selected TypeScript preset, and adds the `@effect/language-service` entry when the setup includes the `effect` preset. Doctor reports a missing or mismatched preset, type resets in a library, and a missing language service entry. It finds the preset through each relative base config that `extends` reaches, such as a shared `tsconfig.base.json`, but not through a base config from another package, such as `@company/config`. In a monorepo, Adamantite still writes no root `tsconfig.json`, and Doctor reports the packages that need the preset. A root `tsconfig.json` that Adamantite wrote before the project became a monorepo stays managed.
  - `.vscode/settings.json` and a new `.vscode/extensions.json`. The extensions file recommends `oxc.oxc-vscode` for the `check` and `fix` scripts, `webpro.vscode-knip` for `analyze`, and `TypeScriptTeam.native-preview` for the `effect` preset, so VS Code offers to install them. Doctor reports a missing Oxlint entry or a missing extension recommendation. `update` now also prepares the Effect editor SDK for VS Code, and the `vscode-effect-sdk` finding says to run `adamantite update`. A project without a matching Effect build gets that finding, and `init` continues instead of failing.
  - `.zed/settings.json`. Doctor reports a missing Oxlint entry and a missing Effect language server, and the Effect editor messages now say to run `adamantite update`. Zed reads `auto_install_extensions` only from the user settings, so `init` prints the link of each Zed extension whenever it sets up Zed.
  - `.github/workflows/adamantite.yml` gets the jobs for the scripts of the recorded setup. Doctor reports a workflow in which no job runs a CI script of the setup, or a job hard-codes a Node.js version. A workflow that `init` cannot write now fails `init` instead of leaving a warning.
  - `AGENTS.md` is written with the Adamantite section only when the project has no `AGENTS.md`. Doctor reports an `AGENTS.md` without the section with the new `missing-agents-section` finding, and the `missing-agents-md` finding now says to run `adamantite update`.
  - Each file of the Adamantite skill in `.agents/skills`, `.claude/skills`, and `.grok/skills`. A copy that matches what Adamantite wrote passes, also in the layout of the project's Oxfmt config. Doctor reports a copy that differs from the shipped skill and from what Adamantite wrote with the new `stale-adamantite-skill` finding, which says to delete the copy and run `adamantite update`. A copy that an earlier version wrote before the lockfile gets that finding once. When a copy misses a file of the skill, Doctor reports the new `missing-adamantite-skill` finding, and `update` writes the missing file.

  `adamantite init --script <name>`, and each script that you select in interactive `init`, now sets that `package.json` script to its Adamantite command and replaces what it ran. `init` prints each script that it added or replaced, with the command that it ran before, and `update` sets the scripts of the recorded selection the same way. A script that you did not select stays as it is. To keep custom tool arguments, pass them after `--` in a script with a name of your own, such as `adamantite analyze -- --directory packages/app`.

  A project with `.oxlintrc.json`, `.oxfmtrc.json`, `knip.json`, or their `.jsonc` forms gets no TypeScript config for that tool, because Oxlint fails when it finds both, Oxfmt loads neither, and Knip loads the JSON config first. Doctor reports the JSON config, also beside a TypeScript config, with the `conflicting-oxlint-config`, `conflicting-oxfmt-config`, or `conflicting-knip-config` finding and the migration. These findings replace `legacy-<tool>-config` and `shadowed-legacy-<tool>-config`, and `init` no longer warns about a JSON config.

  These options and blocks are removed:

  - `--overwrite-scripts`, because `--script` always sets the selected script. `init` no longer keeps a conflicting `check`, `fix`, or `analyze` script, warns about it, or asks whether to replace it.
  - `--install-extensions` and its prompt, which ran `code --install-extension`. `.vscode/extensions.json` replaces it.
  - The `# ADAMANTITE:START` and `# ADAMANTITE:END` block of the GitHub Actions workflow, and the `malformed-adamantite-workflow` finding. Adamantite no longer replaces the jobs between the comments of a workflow that you changed.
  - The `<!-- ADAMANTITE:START -->` and `<!-- ADAMANTITE:END -->` section of an existing `AGENTS.md`. Adamantite no longer splices the section into it.

  To migrate:

  1. Remove `--overwrite-scripts` and `--install-extensions` from scripts and CI that pass them.
  2. Run `adamantite update`.
  3. Run `adamantite doctor`, and repair each finding for a file that you changed.

- [#745](https://github.com/adelrodriguez/adamantite/pull/745) [`dee1661`](https://github.com/adelrodriguez/adamantite/commit/dee16614252e62dfd9221c2a54edb6deea0033cc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Count a line past the print width as multiline in `quality/require-readable-spacing`, so one `adamantite fix` passes `check`

  Oxfmt wraps a statement whose line ends past its `printWidth`, and the wrapped statement needs blank lines around it. `adamantite fix` applies Oxlint fixes before it formats, so Oxfmt could wrap a line after the lint stage, and `check` then failed on a blank line that `fix` had not added. The rule now counts a one-line statement that ends past column 100 as multiline, so it asks for those blank lines before Oxfmt wraps the line. A line that Oxfmt cannot wrap, such as a long template literal, also gets blank lines. If your Oxfmt config sets another `printWidth`, set the rule's new `printWidth` option to the same value. Oxlint still applies one pass of fixes, so a fix that causes a new fixable report needs a second `fix`.

  The rule also keeps single-line bindings grouped before an ASI-guard semicolon. Without semicolons, Oxfmt writes a statement that starts with `[` or `(` as `;[a, b].forEach(f)`. The parser made that semicolon the last token of the binding above it, so the rule counted the binding as two lines, reported it and the next statement, and its fix split the group. The rule now ends a statement at its last token before that semicolon.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report accumulator copies in named reducers, and accept copies with a fixed size, in `quality/no-reduce-accumulator-copy`

  The rule now reports an accumulator copy in a function declaration or a `const` function that a `reduce` call in the same file uses as its reducer, such as `items.reduce(append, [])`. It also reports an accumulator passed to `concat` on a new array, such as `[item].concat(acc)`, `globalThis.Object.assign` and `globalThis.Array.from`, and a copy in a callback that the reducer passes to another call, such as `forEach`. A copy in a stored callback is still allowed.

  The rule no longer reports a copy that cannot grow: a sliding window such as `acc.slice(-2).concat(item)`, a `with`, `toSorted`, or `toReversed` copy of a non-empty tuple that the step returns, and an `Object.assign({}, acc, { sum: acc.sum + n })` copy with fixed keys on a non-empty initial value. A step that also uses the accumulator outside the copy that it returns, as in `acc.push(item)`, is still reported, because it can grow the accumulator first.

  The message used to ask for a mutated accumulator, which the core preset's `no-param-reassign` reports for `acc[key] = value`. It now names `Object.assign(acc, source)`, `acc.push(item)`, `Map#set`, and `Object.fromEntries`, which pass both presets.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report indirect access to Reflect, and accept a `Reflect.get` receiver, in `quality/no-reflect-get` and `quality/no-reflect-apply`

  The strict preset now reports a `Reflect.get` or `Reflect.apply` call that the code reaches through a `const` alias such as `const R = Reflect`, through `globalThis.Reflect`, through destructuring such as `const { get } = Reflect`, through `.call` or `.apply` on the method, or through a template literal key such as ``Reflect[`get`]``.

  A Proxy `get` trap forwards its receiver with `Reflect.get(target, key, receiver)`, so a getter gets the correct `this`, and property syntax cannot pass a receiver. So the strict preset no longer reports a `Reflect.get` call that passes a receiver different from the target, also through `.call` and `.apply`. A call without a receiver, or with the target as the receiver, is still reported.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Exit 1 from `init` and `update` when findings remain, and offer their repair through the resolution menu

  `adamantite update` used to print the findings that remained after the setup and exit 0, and `adamantite init` did not assess the project. Both now exit 1 while findings remain. In an interactive terminal they offer the same resolution menu as `adamantite doctor`: a handoff to an installed coding agent, a copy of the repair prompt, or nothing. After a handoff they assess the project again and exit 0 only when no findings remain. Without a terminal they print the Markdown repair prompt. A CI job that runs `update` and accepts findings now fails, so run `adamantite doctor` to read them, or repair them first.

  Every command that hands a prompt to an agent now uses one flow. When the agent CLI does not start, the command prints and copies the prompt instead of asking whether to copy it. `adamantite doctor` reports a project that does not declare `adamantite` with the new `adamantite-not-installed` finding instead of a message. `adamantite harden` reports a missing install, another installed version, and a `--path` outside the project once on standard error, as other failures are.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ship the custom rule authoring types inside the package, and stop exporting `eslintCompatPlugin`

  `adamantite/rules/plugin` now defines `definePlugin` and `defineRule`, which return their argument, and its declarations include the authoring types of the Oxlint version that Adamantite pins. `@oxlint/plugins` is no longer a runtime dependency, and a project type-checks its custom rules without installing it.

  `adamantite/rules/plugin` no longer exports `eslintCompatPlugin`, which made a `createOnce` rule run in ESLint. Adamantite runs rules only in Oxlint, which runs `createOnce` rules without it, so remove its calls.

- [#745](https://github.com/adelrodriguez/adamantite/pull/745) [`dee1661`](https://github.com/adelrodriguez/adamantite/commit/dee16614252e62dfd9221c2a54edb6deea0033cc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read only the comment above the assertion's own statement, and reject blank markers, in `quality/require-safety-comment-for-type-assertion`

  One `SAFETY:` comment above a test call or a function used to cover every assertion in an `if`, `for`, `while`, or `switch` header inside it. A trailing comment at the end of the previous line, such as `const a = 1 // SAFETY: ...`, also counted for the next line. The rule now stops at the nearest statement and ignores a trailing comment of earlier code. A comment above a `for` statement covers an assertion in its initializer.

  The `markers` option accepted an entry with only spaces, and the rule dropped it without a warning. `{ "markers": ["  "] }` fell back to `SAFETY:`, and `{ "markers": ["WHY", " "] }` lost its second entry. Oxlint now stops with an options validation error for a blank marker, so remove the blank entry from your config.

- [#889](https://github.com/adelrodriguez/adamantite/pull/889) [`8b4668f`](https://github.com/adelrodriguez/adamantite/commit/8b4668fd10a17632b11f9dd8953b20b28719aed3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Record the setup in `.adamantite/adamantite-lock.json`, and run `init` and `update` through one setup

  `init` now writes `.adamantite/adamantite-lock.json` at the project root, or at the workspace root of a monorepo. The lockfile records the selection that `init` set up, the Adamantite version that wrote it, and the hash of each file that Adamantite wrote whole. A later `init` adds its options to the selection, and `update` writes the lockfile again with the installed version.

  `init` and `update` now differ only in where the selection comes from. `init` takes it from the prompts or the flags, and `update` takes it from the lockfile. Both then install the packages, set the managed scripts, write the managed files, write the lockfile, and report the findings that remain. So `init` now prints the findings that `adamantite doctor` would report, such as a missing extension in a `.vscode/extensions.json` that you changed.

  - Installs cover Oxlint, tsrs, Oxfmt, Knip, Sherif, the managed plugin of each selected preset, and `adamantite` itself at the version that runs the command. They include only the packages that `package.json` does not declare at the managed version. `update` prints them under "Packages installed", and no longer updates a tool that the setup does not select. A package that a pnpm catalog declares stays as it is, and Doctor reports an outdated catalog entry.
  - Sherif is installed in every monorepo whose setup includes the `analyze` script, by `update` as well as `init`. A single-package project gets no Sherif.
  - Each file that `init` and `update` write whole, and the lockfile, is formatted with the Oxfmt that the project installs. They use the project's Oxfmt config, or Adamantite's format preset when the project has none yet, and record the hash of the formatted file. So `adamantite check` passes on these files, and `adamantite fix` leaves them as they are. `package.json` gets the same layout when `init` or `update` changes it. A project that installs no Oxfmt gets each file as Adamantite renders it. When the project's Oxfmt config does not load, `init` and `update` fail before they write a file, with an error that names the file.

  Doctor now checks each integration that the lockfile selects. A selected integration whose file is missing or wrong gets a finding, such as a `tsconfig.json` that no longer extends the selected TypeScript preset. An integration that the lockfile does not select gets no findings.

  A project without a lockfile gets the `lockfile-missing` finding alone, from `adamantite doctor` and from `adamantite update`, and both exit 1. `update` no longer reads a setup from the project files, and Doctor no longer prints the "No Adamantite-managed setup found" warning. When the lockfile does not decode or has an unknown `schemaVersion`, Doctor reports the `invalid-lockfile` or `unsupported-lockfile` finding, and `init` and `update` fail before they change a file, with an error that says to run `adamantite doctor`.

  `update` no longer removes the `adamantite` entry from `skills-lock.json`, because Adamantite does not edit a file that another tool owns. When the setup includes agent guidance and that lock records the skill, Doctor reports the `skills-lock-adamantite-entry` finding.

  To migrate, run `adamantite init` once in each project that an earlier version set up, with the options that the project uses, and commit `.adamantite/adamantite-lock.json`. `init` keeps each existing file that differs from what it writes, and Doctor then reports the changes that break the setup.

- [#950](https://github.com/adelrodriguez/adamantite/pull/950) [`b9db5f2`](https://github.com/adelrodriguez/adamantite/commit/b9db5f2046b3a78c147b97eb7ee3da5528624064) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ship two skills: `adamantite` for the toolchain, and `adamantite-hardening` for coding standards

  One skill covered setup, checks, Doctor, updates, hardening, custom rules, and the guide for a fixed mistake, so an agent loaded all of it for any of those tasks. The package now ships two skills, and `adamantite init --agents` writes both to each skill folder:

  - `adamantite` covers setup, `check`, `fix`, `analyze`, Doctor findings, preset rule reports, and `update`.
  - `adamantite-hardening` covers the guide for a fixed mistake and a disable comment, `adamantite harden`, the enforcement ladder, custom rules, rule trials, and layer maps and import owners.

  To migrate, run `adamantite update` and commit the result. It writes `adamantite-hardening` to each skill folder, writes the new `adamantite` skill over each copy that is unchanged, and deletes the three guides that moved, `corrections.md`, `custom-rules.md`, and `enforcement-ladder.md`, where they are unchanged. For a copy that you changed, Doctor reports the `stale-adamantite-skill` finding, which now names the folder of the skill. It also reports a moved guide that you changed, because `update` keeps that file and the skill no longer links to it.

  Three things changed with the split:

  - The Adamantite section of a new `AGENTS.md` names both skills. In an `AGENTS.md` that you changed, replace "the Adamantite skill" with the skill that holds the section: `adamantite-hardening` for custom rules and for a fixed mistake.
  - Doctor reports an `adamantite-hardening` entry in `skills-lock.json` with the `skills-lock-adamantite-entry` finding, as it does for an `adamantite` entry.
  - The harden prompt and `adamantite rule add` send agents to `skills/adamantite-hardening/SKILL.md`.

- [#748](https://github.com/adelrodriguez/adamantite/pull/748) [`1dda6fa`](https://github.com/adelrodriguez/adamantite/commit/1dda6fa5c5b3493412f60cb28399767ecf35db73) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read template literal keys and `globalThis` built-in types in the Adamantite rules

  The rules of the `adamantite`, `quality`, and `quality-effect` plugins now read property keys with one shared helper, so a key form that one plugin reads, the others read too. A template literal with an expression, such as ``items[`${method}`]``, still does not count as a key.

  - The rules that find calls of imported functions, such as `adamantite/no-react-state-hooks`, report ``React[`useState`](0)``.
  - `quality/no-array-filter-map` and `quality/no-reduce-accumulator-copy` read a method name from a template literal, such as ``items[`filter`](f)[`map`](g)`` or ``rows[`reduce`](...)``, as `quality/no-reflect-get` and `quality/no-reflect-apply` do.
  - The `quality-effect` tag rules report ``value[`_tag`] === "Ready"`` and ``{ [`_tag`]: "Ready" }``, classify ``error[`reason`][`_tag`]`` as a reason tag, and accept the pattern object of ``Match[`when`](...)``.
  - `adamantite/no-query-data-in-state` reads ``query[`data`]`` and `{ ["data"]: user }`.
  - In `quality/no-unknown-parameters`, a parser, promise, or `cause` name written as a string or template key, such as `schema["parse"](value)`, gets the same exemption as the plain name.

  The rules also read `globalThis.X` as the built-in `X`, which Effect code writes when `import { Array, Record } from "effect"` hides the global types. `quality/no-widen-then-assert` reports a binding widened to `globalThis.Record<string, unknown>` and asserted back, and no longer calls an assertion to `globalThis.Record<string, unknown>` narrower. `quality/no-array-filter-map` and `quality/no-reduce-accumulator-copy` count `globalThis.Array<T>` and `globalThis.ReadonlyArray<T>` as arrays.

- [#945](https://github.com/adelrodriguez/adamantite/pull/945) [`ef0814b`](https://github.com/adelrodriguez/adamantite/commit/ef0814bdba1405dc3a60e8a0417e3a1c72d0e5ea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report mock implementations and stubbed globals in the strict preset with `testing/no-doubles`

  `testing/no-doubles` now reports each Vitest or Jest test double that replaces what a dependency does, not only a module mock:

  - A mock implementation: `vi.fn(impl)`, `jest.fn(impl)`, and `mockImplementation`, `mockReturnValue`, `mockResolvedValue`, `mockRejectedValue`, their `Once` forms, `mockReturnThis`, and `withImplementation`.
  - A stubbed global or property: `vi.stubGlobal()` and `jest.replaceProperty()`.
  - A spy result for some arguments: `vi.when()`.
  - A module or an object of mocks: `vi.importMock()`, `vi.mockObject()`, `jest.createMockFromModule()`, `jest.genMockFromModule()`, `jest.setMock()`, and `jest.enableAutomock()`.

  A spy, such as `vi.spyOn(store, "save")`, and `vi.fn()` without an implementation only observe the real code, so they stay allowed. To fix a report, pass a test implementation through the dependency's interface, such as an Effect `Layer` or a function parameter.

  The jest and vitest presets turn off `prefer-mock-promise-shorthand` and `prefer-mock-return-shorthand`. They asked for `mockResolvedValue` and `mockReturnValue` in place of a mock implementation, but the strict preset reports both forms. A project without the strict preset can turn the rules on in its own `oxlint.config.ts`. Suppressions that name these rules are unused, so you can delete them.

- [#945](https://github.com/adelrodriguez/adamantite/pull/945) [`ef0814b`](https://github.com/adelrodriguez/adamantite/commit/ef0814bdba1405dc3a60e8a0417e3a1c72d0e5ea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a fixed sleep in a test or a hook in the strict preset with `testing/no-fixed-sleep`

  The strict preset turns on `testing/no-fixed-sleep` in the test files of the jest and vitest presets. It reports a fixed sleep in the body of a test or a hook, such as `await new Promise((resolve) => setTimeout(resolve, 100))`, `await setTimeout(100)` of `node:timers/promises`, `scheduler.wait()`, `Bun.sleep()`, and `yield* Effect.sleep()` in the generator of an Effect test. A sleep guesses how long the work takes, and fails under load.

  To fix a report, await the operation, or a promise that its handler resolves. To move time, use fake timers or `TestClock`. A file that calls `vi.useFakeTimers()` or `jest.useFakeTimers()`, or uses `TestClock`, gets no report. A sleep in a helper or a handler, such as simulated latency in a mock server, stays allowed.

- [#945](https://github.com/adelrodriguez/adamantite/pull/945) [`ef0814b`](https://github.com/adelrodriguez/adamantite/commit/ef0814bdba1405dc3a60e8a0417e3a1c72d0e5ea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report test retries and raised test timeouts in the strict preset with `testing/no-flake-masking`

  The strict preset loads a new first-party plugin, `testing`, and turns on `testing/no-flake-masking` in the test files of the jest and vitest presets. A test that passes only on a retry is flaky, and a raised timeout hides a slow or stuck test. The rule reports a `retry` or `timeout` option of a test or suite, a timeout after the test function, such as `it("loads", fn, 60_000)`, `vi.setConfig()` with `retry`, `testTimeout`, or `hookTimeout`, `jest.retryTimes()`, `jest.setTimeout()`, and `flakyTest` of `@effect/vitest`. In a `vite.config.*` or `vitest.config.*` file, it reports `retry` in the `test` options.

  A hook timeout, such as `beforeAll(setup, 60_000)`, a timeout of `expect.poll()` or `vi.waitFor()`, `testTimeout` or `hookTimeout` in the Vitest config, and a timeout in a benchmark file, such as `index.bench.ts`, stay allowed.

  To fix a report, remove the retry or the timeout, and await the event that the test depends on, or control time with `TestClock` or fake timers. A test that must keep its timeout suppresses the rule with a reason, such as `// oxlint-disable-next-line testing/no-flake-masking -- the test builds the whole package`.

- [#745](https://github.com/adelrodriguez/adamantite/pull/745) [`dee1661`](https://github.com/adelrodriguez/adamantite/commit/dee16614252e62dfd9221c2a54edb6deea0033cc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Allow `typeof` on a value with a declared owned type in `quality/no-runtime-typeof`

  The rule now reports `typeof` only on values that may be unparsed. It allows `typeof` on a variable, a parameter, or a property path such as `options.headers` or `options!.headers`, when the root binding has a type annotation with no `unknown` or `any`, as in `retry: number | RetryPolicy`. It also allows a property destructured from such a binding, as in `const { headers } = options`.

  - The rule resolves local aliases, generic aliases, and aliases of type parameters before it checks the type. A local alias that hides `unknown` or `any`, such as `type Payload = Record<string, unknown>`, does not count as owned, and a local alias of an owned union, such as `type Label = string | (() => string)`, does. An imported alias has no body in the file, so the rule treats it as owned.
  - A type parameter counts as owned only with an owned constraint, as in `<T extends string | number>`. The rule reports `typeof` on a type parameter with no constraint, or with a constraint that has `unknown` or `any`, as in `<T extends Record<string, unknown>>`, also behind `NonNullable`, `NoInfer`, or `Awaited`, or in an intersection with `{}` or `object`. A nearer type alias or interface with the same name hides an outer type parameter, and the rule then checks that declaration.
  - The rule allows `typeof` inside a type guard, also in an inline callback of the guard, such as `value.every((item) => typeof item === "string")`, and in an arrow function whose variable has a type guard type, such as `const isText: (value: unknown) => value is string = (value) => typeof value === "string"`.

  The rule still reports a value typed `unknown` or `any`, an unannotated value, the result of `JSON.parse`, a callback with its own return type that is not a type predicate, and a helper function stored in a variable.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Find `unknown` behind aliases and wrappers, and allow it for parsers and error causes, in the strict preset

  `quality/no-unknown-parameters`, `quality/no-unknown-returns`, and `quality/no-unknown-type-aliases` now share one check for `unknown`:

  - All three rules resolve local type aliases, as in `type Box<T> = T` with `Box<unknown>`, and see through `Awaited<unknown>` and `NoInfer<unknown>`. A local declaration with the same name as a built-in type, such as `interface Promise<T>`, is not treated as the built-in type.
  - `quality/no-unknown-returns` also reports `globalThis.Promise<unknown>`, `Iterable<unknown>`, `AsyncIterable<unknown>`, `AsyncIterator<unknown>`, `Generator<unknown>`, and `AsyncGenerator<unknown>`.
  - `quality/no-known-value-widening` uses the same check for the parameter of a type guard.
  - Each alias body sees only its own type parameters. Before, in `type Reply<Payload> = Envelope | Payload[]`, the rules read an imported `Payload` inside `Envelope` as the `unknown` argument of `Reply<unknown>`. A type argument that names a type parameter of an outer alias, such as `Index<T | Command>`, resolves against that outer alias, so `quality/no-unsafe-dictionary-type` reports it when the outer argument is `unknown`.

  `quality/no-unknown-parameters` allows an `unknown` parameter in two more cases, and one fewer:

  - A function that only passes the parameter to a schema parser, such as `schema.parse(value)`, `z.safeParse(schema, value)`, or `Schema.decodeUnknownSync(User)(value)`, or checks it with `instanceof`, passes. A function that reads the value without parsing it, or that also passes the raw value somewhere else, is still reported.
  - A parameter named `cause` passes only on a constructor, as in `constructor(message: string, cause: unknown)`, and on a function, method, class, or interface whose name ends in `Error` or has the word `cause`, as in `toError`, `AppError`, or `formatCauseDetail`. Before, every `unknown` parameter named `cause` passed, so `function parse(cause: unknown)` did. A `cause` property in an object type, as in `options: { cause: unknown }`, still passes.

- [#832](https://github.com/adelrodriguez/adamantite/pull/832) [`9bdb04b`](https://github.com/adelrodriguez/adamantite/commit/9bdb04b7f8bb4b7a694b94d81d1750c5a12e3a04) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report an unused `oxlint-disable` comment in `adamantite check`, and remove it in `adamantite fix`

  The core preset sets `options.reportUnusedDisableDirectives` to `"error"`. `adamantite check` now fails on an `oxlint-disable` comment that suppresses nothing, and `adamantite fix` removes the comment with Oxlint 1.93 or later. With Oxlint 1.92, remove the comment yourself. When `fix` removes a comment that has no reason, the same run still reports `adamantite/require-suppression-reason` for the comment, and the next `check` passes.

  Zed and VS Code now report these comments with the severity from the Oxlint config. The Zed settings that Adamantite writes no longer set `unusedDisableDirectives`. If you changed `.zed/settings.json`, remove `lsp.oxlint.initialization_options.settings.unusedDisableDirectives` so that Zed follows your Oxlint config.

  To turn the report off, set `options.reportUnusedDisableDirectives` to `"off"` in the root `oxlint.config.ts`. Oxlint reads this option only from the root config.

- [#779](https://github.com/adelrodriguez/adamantite/pull/779) [`6ee9d13`](https://github.com/adelrodriguez/adamantite/commit/6ee9d1319ac5829b98478f3808263acfdc7f64ab) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Oxlint to 1.93, Oxfmt to 0.78, tsrs to 0.25, Knip to 6.45, and `@effect/tsgo` to 0.69, and trim the runtime dependencies

  The managed tooling versions are now Oxlint 1.93.0, Oxfmt 0.78.0, tsrs 0.25.0-ts7.1.0-beta, Knip 6.45.1, and `@effect/tsgo` 0.69.0. The optional peer ranges move to `oxlint` 1.92.0 or later and `tsrs` 0.25.0-ts7.1.0-beta or later. npm rejected tsrs 0.25.0-ts7.1.0-beta against the old range, because a prerelease matches a range only through a version with the same major, minor, and patch.

  - The type-aware rules now have builds for Windows ARM64: tsrs 0.25.0 publishes `@tsrs/win32-arm64`, and `@effect/tsgo` 0.69.0 ships a Windows ARM64 build of tsrs.
  - Oxlint 1.92.0 and later find the `tsrs-lint` launcher in `node_modules/.bin` themselves. Outside Windows, the Oxlint entry that `adamantite check`, `adamantite fix`, and the editors run no longer names the launcher in `OXLINT_TSGOLINT_PATH`.
  - The effect preset enables the two new `@effect/tsgo` rules. `effecttsgo/missing-concurrency-option` reports an `Effect.all` or `Effect.forEach` call without a `concurrency` option, because these calls run one effect at a time unless the option says otherwise. `effecttsgo/on-exit-failure-to-on-error` reports an `Effect.onExit` callback that acts only on failure, which `Effect.onError` replaces.

  The runtime dependencies are now `effect`, `@effect/platform-node`, and `oxc-resolver`. Adamantite no longer installs `@clack/prompts`, `jsonc-parser`, `nypm`, `oxc-parser`, `@oxlint/plugins`, or `@effect/platform-node-shared`. `@effect/platform-node@4.1.2` depends on `@effect/platform-node-shared` at exactly `4.1.2`, so installs resolve the same version as before ([#511](https://github.com/adelrodriguez/adamantite/issues/511)). Adamantite reads JSON files with the parsers in Effect, so a parse error now shows one line and column, such as `Invalid JSONC at line 3, column 3`, and a `__proto__` key in a project file is read as an ordinary key.

  To upgrade an existing project:

  - Run `adamantite update` to install the new versions.
  - In a project with the effect preset, expect `adamantite check` to report `Effect.all` and `Effect.forEach` calls without a `concurrency` option. Add `{ concurrency: 1 }` to keep the current order, or set the concurrency that the code needs.
  - Expect `adamantite check` to report a rejection callback that is the second argument of `then()`. Oxlint 1.93 reports it with `promise/prefer-catch`, which the core preset turns on. Move the callback to `.catch()`.
  - In a Vue project, expect `adamantite fix` to format `.vue` files differently. Oxfmt 0.77.0 formats them with its own formatter instead of Prettier ([oxc-project/oxc#28848](https://github.com/oxc-project/oxc/issues/28848)).
  - In an Astro or Svelte project, expect `adamantite fix` to format `.astro` and `.svelte` files. The format preset turns on Oxfmt's `astro` and `svelte` options, and Zed and VS Code format both languages with Oxfmt. Oxfmt needs a package from the project: `@astrojs/compiler-rs`, which Astro 7 and later install, and `svelte` 5 or later. In an Astro 5 or 6 project, or a Svelte 3 or 4 project, Oxfmt fails on those files, and Doctor reports it. Run `adamantite update` to move Zed's Astro setup from Prettier to Oxfmt.

- [#923](https://github.com/adelrodriguez/adamantite/pull/923) [`1a618c8`](https://github.com/adelrodriguez/adamantite/commit/1a618c8d41c04672dda7010ac3e1d3bd145caa98) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Oxlint to 1.94 and `@effect/tsgo` to 0.70, and enable the two new Effect rules

  The managed tooling versions are now Oxlint 1.94.0 and `@effect/tsgo` 0.70.0. `@effect/tsgo` 0.70.0 ships the Effect build of Oxlint 1.94.0 and keeps the build of tsrs 0.25.0-ts7.1.0-beta, so tsrs stays at that version.

  The effect preset enables the two new `@effect/tsgo` rules:

  - `effecttsgo/flat-map-provide-service-to-provide-service-effect` reports an `Effect.flatMap` whose callback only passes its parameter to `Effect.provideService`. `Effect.provideServiceEffect` replaces it.
  - `effecttsgo/for-loop-push-to-for-each` reports a `for...of` loop in an Effect generator that only pushes `yield*` results into an array declared just before the loop. `Effect.forEach` replaces it.

  To upgrade an existing project:

  - Run `adamantite update` to install the new versions.
  - In a project with the effect preset, expect `adamantite check` to report the code that the two new rules describe. Both rules come with a fix in the editor.
  - Expect `adamantite fix` to apply fewer fixes. Oxlint 1.94 turns the fixes of several rules into suggested fixes, such as `no-useless-escape`, `no-regex-spaces`, `typescript/no-import-type-side-effects`, and the `prefer-to-be` and `prefer-called-with` rules of Jest and Vitest. Run `adamantite fix --suggested` to apply them, and review the changes.

- [#971](https://github.com/adelrodriguez/adamantite/pull/971) [`8462846`](https://github.com/adelrodriguez/adamantite/commit/8462846160b8529c128b3468712577616567a670) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ship the changelog, and print the notes of each release since the recorded version in `adamantite update`

  The package now ships `CHANGELOG.md`, so the notes that an agent reads match the installed version. Before, the Adamantite skill and Doctor linked the changelog on GitHub `main`, which can name releases that the project does not run.

  - `adamantite update` reads the version that the lockfile recorded before it writes the installed version, and prints the notes of each release since then, oldest first. A terminal gets one link to the GitHub release of each version. A run without a terminal prints the notes as Markdown. `adamantite update --json` puts them in `releaseNotes`, with the path of the changelog and the recorded version in `from`. `releaseNotes` is `null` for `init`, and for `update` when it has no range to read.
  - The `oxlint-config-load-failure` finding now names the path of the installed changelog, and tells the agent to search it for a preset that the package no longer exports. The Adamantite skill gives the same repair.

- [#746](https://github.com/adelrodriguez/adamantite/pull/746) [`8f85ae5`](https://github.com/adelrodriguez/adamantite/commit/8f85ae57923a616c0d27712d4cbad32926a3d0fc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report more assertion chains, and name `@ts-expect-error` for test input, in the strict preset's assertion rules

  - `quality/no-widen-then-assert` reports an assertion of a widened binding anywhere after the declaration in the declaring function, including in the functions nested in it, such as a test callback inside `describe`. The binding is a `const` with no writes, so a nested function sees the same value.
  - `quality/no-chained-type-assertions` looks through a `satisfies` expression between two assertions, such as `(value as unknown satisfies unknown) as number`, as it looks through parentheses, because `satisfies` keeps the type of its operand.
  - The messages of both rules now tell you to pass input of the wrong type without an assertion and put `// @ts-expect-error -- reason` above the call. A test that passes such input on purpose, such as `parsePort("abc" as unknown as number)`, had no form that both rules accept.

### Patch Changes

- [#781](https://github.com/adelrodriguez/adamantite/pull/781) [`e49c354`](https://github.com/adelrodriguez/adamantite/commit/e49c3549476f5d4805d21e39443e26476ca25918) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Accept correct code that the core preset reported

  The core lint preset changes these rules, so code that has no other correct form passes:

  - `no-await-in-loop` is off. The rule told the author to start the calls together, and that is a defect when each call needs the result of the call before it, such as a retry, a lock order, or a page that depends on the page before it.
  - `oxc/no-map-spread` is off. The rule reported `{ ...item, done: true }` in a `map` callback and asked for a change in place, so no immutable copy passed core. React state updates use this copy in reducers and event handlers.
  - `prefer-object-spread` is off. The rule reported `Object.assign({}, acc, { sum: acc.sum + item.n })` in a `reduce` callback, and its fix wrote a spread that `oxc/no-accumulating-spread` reports. The strict preset still reports an `Object.assign` copy when the accumulator can grow.
  - `typescript/non-nullable-type-assertion-style` is off. The rule reported `value as string` and told the author to write `value!`, which `typescript/no-non-null-assertion` bans.
  - `no-throw-literal` is off. `typescript/only-throw-error` reports every throw that it reported, such as `throw "failed"`, so one throw got two reports. A suppression now names only `typescript/only-throw-error`.
  - `no-redeclare` is off in TypeScript files, so a type and a value can share a name, such as `const Port = Schema.Number` with `type Port = typeof Port.Type`. The type check still reports a value that is declared two times. The setting is in an override of the preset, so change it in an `overrides` entry of your config, because the preset's override takes priority over top-level `rules`.
  - `import/unambiguous` is off in `*.d.ts`, `.astro`, `.vue`, and `.svelte` files. A declaration file without an `import` or `export` is a script on purpose, because only a script can declare a wildcard module, such as `declare module "*?raw"`, or a global. The frameworks compile a component's script as a module. The rule still reports `.js` and `.ts` files.
  - `jsdoc/check-tag-names` uses `typed: false` in `.js`, `.jsx`, `.mjs`, and `.cjs` files, so a JavaScript file can state types with tags such as `@type`.
  - `unicorn/no-useless-undefined` uses `checkArguments: false` and `checkArrowFunctionBody: false`, so it keeps a required argument such as `consume(undefined)` and a concise result such as `() => undefined`. The rule still reports redundant initializers, yields, and empty functions. For a block callback with an explicit `return undefined`, declare a union result type such as `: number | undefined`, because the rule still reports an unannotated return and its fix can conflict with the callback-return checks. With the effect preset, `Effect.succeed(undefined)` still gets the Effect rule that recommends `Effect.undefined`.

  Suppressions, overrides, and placeholder exports that you added for these rules are now unneeded, so you can delete them.

- [#925](https://github.com/adelrodriguez/adamantite/pull/925) [`a47c74d`](https://github.com/adelrodriguez/adamantite/commit/a47c74de7c6675c237de7465d3ddba964b385676) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Bundle Effect into the CLI, so commands start sooner and installs skip `effect` and `@effect/platform-node`

  The CLI and the Oxlint entry now include the Effect modules that they use. Node.js loads three files at startup in place of more than two hundred Effect modules, and it keeps the compiled code of the CLI in its compile cache, so later runs of `adamantite check` and `adamantite fix` reach Oxlint and Oxfmt sooner. Adamantite no longer installs `effect` or `@effect/platform-node`. A project that imports them lists them itself, as it already had to.

- [#921](https://github.com/adelrodriguez/adamantite/pull/921) [`f5b4ae9`](https://github.com/adelrodriguez/adamantite/commit/f5b4ae9da99e96fb06c413887ded342eef23e798) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Run the format and lint stages of `adamantite check` at the same time

  `adamantite check` now starts Oxfmt and Oxlint together, so a check takes about as long as its lint stage. The output keeps its order: the Oxfmt section prints first, and the Oxlint section prints after Oxfmt ends. Each stage writes to a pipe, and Adamantite sets `FORCE_COLOR` for both when the terminal shows color. `check --only format` and `check --only lint` run as before.

- [#961](https://github.com/adelrodriguez/adamantite/pull/961) [`83569bd`](https://github.com/adelrodriguez/adamantite/commit/83569bd703f484bdb51d29529c03015a49756944) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Print the stage headings of `adamantite check` only on a plain run

  `adamantite check` and `adamantite check <files>` still print a heading above each stage, such as `🔍 Linting · adamantite (oxlint)`. With `--only` or arguments after `--`, `check` prints only the tool's output, so `adamantite check --only lint -- --format json` prints one JSON document that a script can parse. In a coding agent's shell, where Oxlint prints its agent report, `check` prints no heading either, so a passing lint no longer ends the output with a heading and no result. Adamantite reads the same environment variables as Oxlint 1.94.0 to detect an agent.

- [#947](https://github.com/adelrodriguez/adamantite/pull/947) [`c31e02e`](https://github.com/adelrodriguez/adamantite/commit/c31e02e410d97f544e52d1a370eaba022ca7ac0f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Share Node.js's compile cache with the tools that Adamantite starts, so Oxlint starts sooner

  `bin/adamantite` sets `NODE_COMPILE_CACHE` to its own compile cache folder for every process that the CLI starts, unless you set the variable yourself. Oxlint then loads its own compiled code from the cache instead of compiling its JavaScript on every run. `NODE_DISABLE_COMPILE_CACHE` still turns the cache off.

- [#798](https://github.com/adelrodriguez/adamantite/pull/798) [`13a54d6`](https://github.com/adelrodriguez/adamantite/commit/13a54d679398012de6a88bb35c40c2818d3191c8) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a preset that comes before core in `extends`

  Oxlint applies the `extends` entries of `oxlint.config.ts` in order, and a later entry replaces the rules of an earlier one. The strict preset changes three rules of core, and the effect preset turns three off. With `extends: [strict, core]`, core replaced those changes, so the ban on type assertions was off, and no tool reported it. `adamantite doctor` now reports each Adamantite preset that comes before a core entry with the `core-preset-order` finding, which names the preset modules, such as `adamantite/lint/strict`, and tells you to move core directly before the first Adamantite preset.

- [#933](https://github.com/adelrodriguez/adamantite/pull/933) [`da160de`](https://github.com/adelrodriguez/adamantite/commit/da160deb598e5c6d614d25762a4f7cece8c5a22f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Correct what the `adamantite-hardening` skill and the README say about a custom rule that throws

  The custom rules guide of the skill and the README said that a custom rule that throws prints an error for each file while Oxlint still exits 0. That is false. When a rule throws in a visitor, or in `before` or `after`, Oxlint fails the lint run and reports `Error running JS plugin`, with the stack of the throw, for each file in which the rule throws. For those files, Oxlint omits the reports of every other rule that a JavaScript plugin provides, such as the other custom rules and `adamantite/layers`. Its native rules still report. A throw in the `createOnce` body, or while the rule file loads, stops Oxlint with `Failed to load JS plugin` before it lints a file.

  The skill now tells agents to fix the throw first, and to run lint again before they trust the remaining reports. Oxlint 1.92.0 and 1.94.0 behave this way.

- [#928](https://github.com/adelrodriguez/adamantite/pull/928) [`4861700`](https://github.com/adelrodriguez/adamantite/commit/48617001e8004c0b6b41a7f11a33073ade224b76) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a managed script that does not run its Adamantite command in Doctor

  `adamantite doctor` now compares each selected managed script in the root `package.json` with its command, such as `adamantite check` for `check`. A project could replace the `check` script with another command, and Doctor reported nothing while `pnpm run check` and the generated CI workflow passed without running Adamantite.

  Doctor reports the `missing-managed-script` finding for a selected script that `package.json` does not have, and the `mismatched-managed-script` finding for one that runs another command. Both say to run `adamantite update`, which sets the script to its command. If the project still needs the earlier command, move it to a script of another name before the update, and run that script wherever the project ran the managed script, such as in CI.

- [#922](https://github.com/adelrodriguez/adamantite/pull/922) [`a5fa677`](https://github.com/adelrodriguez/adamantite/commit/a5fa677c9d232fda932251056cd215bdbf15418a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop predicting which Oxlint binding and tsrs binary load in Doctor

  Doctor no longer guesses which `@oxlint/binding-*` or `@tsrs/*` platform package Oxlint and tsrs load on this machine, a choice that it copied from their loaders and that could disagree with them. It still reports a missing declared package, a missing `tsrs-lint` launcher, and an `@effect/tsgo` without a build or the bridge for the installed versions.

  When the platform package is missing, `adamantite check` stops with the error of the tool that needs it. Oxlint prints `Cannot find native binding` with each file that it tried, and tsrs names the missing `@tsrs/*` package. The Adamantite skill tells agents to reinstall the dependencies with optional dependencies for this platform.

  Doctor runs Oxlint, so a missing Oxlint binding still gives the `oxlint-config-load-failure` finding with Oxlint's error. The finding is now titled "Oxlint stops before it lints a file", and it tells the agent to reinstall the dependencies, not to change the config, when the error says `Cannot find native binding`.

- [#918](https://github.com/adelrodriguez/adamantite/pull/918) [`0294363`](https://github.com/adelrodriguez/adamantite/commit/02943636b27052f2cc96cde06a3812ad86b2a5fa) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Load the Effect build of Oxlint through `@effect/tsgo/oxlint-bridge`, and report a missing binding package in Effect projects

  The Oxlint entry that `adamantite check`, `adamantite fix`, and the editors run no longer sets `NAPI_RS_NATIVE_LIBRARY_PATH`. It loads `@effect/tsgo/oxlint-bridge`, which swaps Oxlint's installed binding for the Effect build as Oxlint loads it and leaves every other napi-rs binding unchanged.

  The bridge needs the installed `@oxlint/binding-<platform>` package, so Doctor now checks for that package in a project with `@effect/tsgo` too. Doctor also reports an `@effect/tsgo` that ships no bridge. Run `adamantite update` to install the managed version.

- [#816](https://github.com/adelrodriguez/adamantite/pull/816) [`8c82710`](https://github.com/adelrodriguez/adamantite/commit/8c827105aecbac70e169bbb54714da81b9e58bc1) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Turn off the core rules that read Effect functions as built-in methods in the effect preset

  These core rules match a method by its name only, so they reported Effect code as misused promises, strings, and arrays. The effect lint preset now turns them off:

  - `promise/valid-params` reported the data-first `Effect.catch(load("a"), () => load("b"))` as `Promise.catch()` with 2 arguments.
  - `promise/no-nesting` reported an `Effect.catch` in the handler of another `Effect.catch` as a nested promise.
  - `array-callback-return` reported an `Effect.map` or `Option.map` callback that returns nothing, which is the form that the fix of `typescript/no-confusing-void-expression` writes.
  - `unicorn/prefer-string-slice` rewrote `String.substring(1)` from `effect/String` to `String.slice(1)`, a different Effect function that reads a negative index from the end.
  - `unicorn/prefer-array-find` and `unicorn/prefer-array-some` reported `Array.filter(values, predicate)[0]` and `Array.filter(values, predicate).length > 0` from `effect/Array`, which has no `find`.
  - `unicorn/throw-new-error` reported an error class that `Schema.TaggedError` or `Schema.Error` makes as an error made without `new`, and its fix broke the class. The rule stays off until Oxlint fixes [oxc-project/oxc#27718](https://github.com/oxc-project/oxc/issues/27718).

  In a project with the effect preset, these rules no longer report the same patterns on native promises, strings, and arrays. The type check still reports a promise method call with the wrong arguments, and, with `noImplicitReturns` as in `adamantite/tsconfig` and `adamantite/typescript`, a callback that returns a value on only some paths.

- [#830](https://github.com/adelrodriguez/adamantite/pull/830) [`963329a`](https://github.com/adelrodriguez/adamantite/commit/963329a147131185061bf82b675398c01142800e) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Accept correct test code in the jest and vitest presets, and allow only one of the two

  - `consistent-test-it` is off for a time. Its fix renamed a `test` call in `describe` to `it`, but did not change the import, so the file failed at run time unless Vitest ran with `globals: true`. The presets will turn the rule on again when an Oxlint release keeps the import ([oxc-project/oxc#29181](https://github.com/oxc-project/oxc/issues/29181)).
  - `prefer-lowercase-title` has `ignore: ["describe"]`, so `describe("Calculator", ...)` passes, because a describe title often names the class or function under test. The rule still reports a test title that starts with a capital letter.
  - `require-hook` accepts a top-level `tester.run(...)` call, and `vitest/require-hook` also accepts a `layer(TestLayer)("name", (it) => ...)` suite of `@effect/vitest`. The rule matches the name of the call, not the import, so a top-level call of another function named `layer` also passes. The RuleTester test that `adamantite rule test add` writes no longer has a suppression for `require-hook`, and `adamantite fix` removes that suppression from a test that it wrote before.
  - `vitest/prefer-import-in-mock` and `jest/no-untyped-mock-factory` are off. They told the author how to write a module mock, but the strict preset's `testing/no-doubles` bans each module mock, so the code that obeyed the first report still failed. A project without the strict preset can turn the rules on in its own `oxlint.config.ts`.

  The two presets report the same test defects, so a config that extended both gave two reports for each defect. `adamantite init` now rejects `--preset jest --preset vitest`, and the interactive prompt asks which of the two presets to keep. `adamantite doctor` reports a config that extends both presets. A config that uses each preset in an override of its own is not reported.

  Suppressions that name the rules that are now off are unused, so you can delete them.

- [#932](https://github.com/adelrodriguez/adamantite/pull/932) [`33e1358`](https://github.com/adelrodriguez/adamantite/commit/33e13585129fcba8d51789ae1d481fee424f1b92) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Lint faster with the strict preset's quality rules

  The quality rules now record type declarations while Oxlint walks a file, instead of walking each file a second time. `quality/no-widen-then-assert`, `quality/no-shape-in-symbol-names`, and `quality/no-known-value-widening` now build scope analysis only for a file that has a candidate to check. On three TypeScript projects of 400 to 950 files, the rules spent about 45% less time per lint, and a lint with only these rules took about 25% less time. The rules report the same diagnostics as before.

- [#972](https://github.com/adelrodriguez/adamantite/pull/972) [`6c1e2d1`](https://github.com/adelrodriguez/adamantite/commit/6c1e2d1e4f189f80ad635e869b324c3ccb5fcdba) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Print the stage headings of `adamantite fix` and `adamantite analyze` only on a plain run, as `adamantite check` does

  `adamantite fix`, `adamantite fix <files>`, and `adamantite analyze` still print a heading above each stage. With `--only` or arguments after `--`, they print only the tool's output, such as a Knip reporter that a script parses. In a coding agent's shell, where Oxlint prints its agent report, they print no heading either, so an agent reads the same kind of output from `check`, `fix`, and `analyze`.

- [#970](https://github.com/adelrodriguez/adamantite/pull/970) [`cd9f0b3`](https://github.com/adelrodriguez/adamantite/commit/cd9f0b30bca882c437332dd43849defab0343cea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Type the `printWidth` of `adamantite/format` as set

  The default export of `adamantite/format` now has the type `FormatConfig & Required<Pick<FormatConfig, "printWidth">>`, so `format.printWidth` reads as a `number` instead of `number | undefined`. A config that spreads the preset or exports it unchanged still type-checks. A config that deletes `printWidth` from the preset to use the default of Oxfmt no longer type-checks: leave it out of a copy instead, as in `const { printWidth: _printWidth, ...preset } = format`.

- [#934](https://github.com/adelrodriguez/adamantite/pull/934) [`070d6a1`](https://github.com/adelrodriguez/adamantite/commit/070d6a15e64915711e844e91790e4b45497b107d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - State the enforcement ladder in one file, and stop the harden prompt from favoring lint rules

  The harden prompt, the glossary, and `adamantite harden --help` described what hardening produces in three ways. The Adamantite skill now defines the enforcement ladder in `references/enforcement-ladder.md`, and the harden prompt shows that file in step 7. The ladder has six steps: a type or structure, a preset rule, an import rule, a project check, a custom rule, and an instruction. A project check now includes a test, which holds a standard about behavior.

  The harden prompt changes in four places:

  - It scores a candidate by the mistake that the proposal prevents and the valid code that it accepts, not by its step. An instruction with a reason and an example can score 5.
  - An instruction is an entry in `CODING_STANDARDS.md` with the standard, the reason, how to spot the mistake, and an example from the project. It was one line.
  - When a rule covers an instruction, the agent deletes only the text that repeats the rule's report. It keeps the reason and the example of a standard that shapes a design.
  - The agent fixes the code that a new rule reports in the same change when you approve the fixes with the candidate. Otherwise it still turns the rule off in the files that break it, and now states in a comment above the override what removes each file from it.

- [#930](https://github.com/adelrodriguez/adamantite/pull/930) [`12bb3e2`](https://github.com/adelrodriguez/adamantite/commit/12bb3e233368daf344d5a8c3ad7bde678a44949d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Leave agent skills out of the documentation that `adamantite harden` lists

  `adamantite harden` listed each Markdown file in a skill folder, such as `.agents/skills` or `.claude/skills`, as documentation, and as a file that no `AGENTS.md` reaches. In a project that `adamantite init --agents` had just set up, it listed the Adamantite skill and its guides that way, once for each skill folder.

  A coding agent finds the skills in its skill folder on its own, so no `AGENTS.md` has to link to them. The harden prompt and `harden --json` now leave the files of each skill folder out of `documentationFiles` and `agentReach`, in the root and in each workspace package.

- [#871](https://github.com/adelrodriguez/adamantite/pull/871) [`a249904`](https://github.com/adelrodriguez/adamantite/commit/a2499046f4f8430afe45fa5f388b57dfba39e398) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Name the option that produced each `adamantite/import-owners` report

  A report of `adamantite/import-owners` named the owners, but not the option that restricted the import. With many options, or with two options for the same module, you could not tell which option to change. Each report now names the option, such as `options[1]`, with the same convention as `adamantite/layers`. It also says whether the owner paths are relative to the workspace root or to the package root. The report does not print the path of the root, because that path is different on each machine.

- [#892](https://github.com/adelrodriguez/adamantite/pull/892) [`35d9df8`](https://github.com/adelrodriguez/adamantite/commit/35d9df853994e108ff01c53cc156daa045999866) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Name the `init` command that adds a tool when the setup does not select it

  When Oxlint, Oxfmt, Knip, or Sherif is not installed and the lockfile selects no script that runs it, `adamantite check`, `adamantite fix`, and `adamantite analyze` now fail with a `ToolNotSelected` error. Setup does not install such a tool, so the error names the command that adds the script and installs the tool, such as `adamantite init --non-interactive --script check`. Before, the commands said "`oxlint` is not installed" or "The command `oxfmt` was not found on PATH", and pointed to `adamantite update`, which installs nothing for that selection. A tool that the selection leaves out but that is installed still runs. Without a lockfile, or for a selected tool that is not installed, the commands fail as before.

- [#959](https://github.com/adelrodriguez/adamantite/pull/959) [`45e6254`](https://github.com/adelrodriguez/adamantite/commit/45e625475182e9a180219688729050145f9f2721) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Tell agents that a code comment does not hold a standard

  The enforcement ladder in the `adamantite-hardening` skill now says that a code comment is not a step. When a comment states a standard or an invariant of the project's own code, the agent puts the standard on a step of the ladder, such as a type, a rule, or a test, and deletes the comment. The comment beside a rule that states the standard and its reason stays, such as the comment at the top of a custom rule file. The harden prompt shows the ladder, so `adamantite harden` gives the same instruction.

- [#946](https://github.com/adelrodriguez/adamantite/pull/946) [`3d12515`](https://github.com/adelrodriguez/adamantite/commit/3d1251500a9b130b74d65ee40af6a2666de0c668) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Start each command without loading ICU's data

  `adamantite check`, `fix`, and the other commands no longer create an `Intl` object at startup. The first `Intl` object loads ICU's data, which slowed every command. The bundled Effect now creates its grapheme segmenter when the CLI first measures text, such as for `--help`.

- [#898](https://github.com/adelrodriguez/adamantite/pull/898) [`9229478`](https://github.com/adelrodriguez/adamantite/commit/92294783fdf1034230f51179f9334e9825c55d78) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop `init` from setting up Oxlint in a folder that a parent Oxlint config lints

  `init` in a subfolder wrote an `oxlint.config.ts` with `options.typeAware`, `options.typeCheck`, and `options.respectEslintDisableDirectives`. Oxlint accepts those options only in the root config, so `adamantite check` failed in the parent project. Now, when the selection includes a script that runs Oxlint and any parent folder up to the filesystem root has an Oxlint config, also past a folder that holds `.git`, `init` fails with `ParentOxlintConfig` before it changes a file. Run `adamantite init` at the root of the parent project, or extend the root config in the folder, as "Custom rules in a monorepo" in the README shows. A nested `init` without a lint script, such as one that sets up only an editor, still works.

- [#947](https://github.com/adelrodriguez/adamantite/pull/947) [`c31e02e`](https://github.com/adelrodriguez/adamantite/commit/c31e02e410d97f544e52d1a370eaba022ca7ac0f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Start the project's Oxfmt with `node` in `adamantite check` and `fix`, so formatting starts sooner

  `check` and `fix` no longer go through the shell script in `node_modules/.bin`. They start the CLI module of the Oxfmt that the project installs. When Oxfmt is missing, the error now says that the project does not install `oxfmt`, instead of that `PATH` has no `oxfmt`. An `oxfmt` on `PATH` that the project does not install no longer runs.

- [#824](https://github.com/adelrodriguez/adamantite/pull/824) [`aaa0616`](https://github.com/adelrodriguez/adamantite/commit/aaa06167fbbfab1c997712239d17090dc27ad9b6) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Describe Adamantite as agent-first, and document preset overrides and core advice in the README

  - The npm description and the README tagline now read "Strict, agent-first code-quality toolchain for TypeScript codebases." The README introduction says that Adamantite helps coding agents write excellent code.
  - A top-level `rules` setting has no effect on a rule that a preset sets in an override, for the files of that override, and Oxlint gives no warning. The README now gives the order in which Oxlint applies `rules` and `overrides`, and lists the files and rules of each override in the core, strict, tailwind, jest, and vitest presets.
  - The README explains that, with the strict preset, the help of `typescript/no-explicit-any`, `typescript/no-wrapper-object-types`, and `unicorn/no-instanceof-builtins` recommends a form that strict reports. Follow the strict report that comes next, which names a form that both presets accept.
  - The README no longer links to the architecture decision records, which no longer exist.

- [#820](https://github.com/adelrodriguez/adamantite/pull/820) [`2e1aff8`](https://github.com/adelrodriguez/adamantite/commit/2e1aff8452eb9d46904eb9bd7d1a691f0369729d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Make the React and Next.js presets agree with core and react-strict

  - The react lint preset no longer turns on `react/jsx-no-constructed-context-values`. The rule reported `<ThemeContext.Provider value={{ mode }}>` and asked for `useMemo`, but react-strict bans `useMemo` in feature code because the React Compiler memoizes. The react preset already left out the similar `react-perf` rules. A project without the React Compiler can turn the rule on in its own `oxlint.config.ts`.
  - The nextjs lint preset now turns off `typescript/require-await`. Next.js rejects each exported function of a `"use server"` file that is not async, so the rule reported a server action that the user could not change. An Oxlint override cannot select a file by its `"use server"` directive, so the rule is off in all files.
  - The default `allow` list of `adamantite/no-react-state-hooks` now includes `**/hooks.{ts,tsx}`, for a feature that keeps its hooks in one file, such as `features/cart/hooks.ts`. It no longer includes `**/use[A-Z]*.{ts,tsx}`, because core's `unicorn/filename-case` asks for `use-counter.ts` instead of `useCounter.ts`. Rename such a hook module, or move it under a `hooks` directory. A project that keeps camelCase file names can add `"**/use[A-Z]*.{ts,tsx}"` to the rule's `allow` option, and an `allow` option that only repeated the defaults to add the `hooks.ts` glob can go.

- [#745](https://github.com/adelrodriguez/adamantite/pull/745) [`dee1661`](https://github.com/adelrodriguez/adamantite/commit/dee16614252e62dfd9221c2a54edb6deea0033cc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report only the names that a file declares in `quality/no-shape-in-symbol-names`

  The rule now checks the bindings, types, and members that a file declares, and a renamed import or export. It no longer reports a name that comes from another module, such as `import type { ZodRawShape } from "zod"`, `UserSchema.shape`, a JSX attribute, or an object key passed to another library. It reports each declaration once, not once for each reference.

- [#973](https://github.com/adelrodriguez/adamantite/pull/973) [`4e51b23`](https://github.com/adelrodriguez/adamantite/commit/4e51b23476120417377e75536d1a741aec40bc49) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Teach agents to adopt Adamantite in existing code

  The setup guide of the `adamantite` skill now has a section for code written before the setup. The agent runs `adamantite fix`, counts the remaining reports and files for each rule from `adamantite check --only lint -- --format json`, fixes the rules with few reports, and turns each remaining rule off only in the files that break it now, in an Oxlint override. It keeps each preset rule at `error`, and does not add disable comments or turn a rule off for the whole project.

- [#934](https://github.com/adelrodriguez/adamantite/pull/934) [`070d6a1`](https://github.com/adelrodriguez/adamantite/commit/070d6a15e64915711e844e91790e4b45497b107d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add a guide to the Adamantite skill for keeping a fixed mistake from recurring

  The skill has a new section, "Keep a fixed mistake from recurring", with the guide `references/corrections.md`. An agent follows it after it fixes a regression, a mistake that a reviewer corrected before, or a break of a project standard that no check reported. The guide starts from that one mistake, chooses a step of the enforcement ladder, such as a test, a type, a rule, or an instruction, and proves the choice. A regression test needs no approval. A new standard waits for yours. `adamantite harden` stays the audit of every standard of the project.

  The guide also covers a disable comment. Before an agent adds one, it fixes the code, or gives the suppression a reason. When a comment already suppresses the same rule for the same reason, the agent adds no further comment and treats the repeated suppression as the mistake: it proposes the exception once, in an option of the rule or in an override. Before the guide chooses a step, the agent runs `adamantite rule try <rule> --current --report <case>`, and stops when a rule of the config already reports the mistake.

  The Adamantite section that `init --agents` writes to `AGENTS.md` now sends agents to that section of the skill after a fix and before a disable comment. `adamantite update` writes the new section to an `AGENTS.md` that is unchanged since Adamantite wrote it.

  The skill also tells agents that `adamantite check` does not run the project's tests, so they run the tests of each changed behavior. The setup guide tells agents who move a replaced script's command to another script to make CI and Git hooks run that script, because the workflow that Adamantite writes runs only the managed scripts.

- [#926](https://github.com/adelrodriguez/adamantite/pull/926) [`efe3256`](https://github.com/adelrodriguez/adamantite/commit/efe32567f2f5164e06647b39410a8d04b4938f11) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Start Oxlint's own CLI from `adamantite check`, `fix`, and `harden`, so Effect loads once per command

  The CLI now resolves the project's Oxlint runtime itself and starts Oxlint's `dist/cli.js` with `node`, with the runtime's variables and preload module. No second Node.js process loads Effect to resolve the runtime again, so linting starts sooner. Editors still start `node_modules/adamantite/dist/oxlint.js`, which no longer reads `ADAMANTITE_PROJECT`. When Oxlint is missing, `adamantite check` still checks the formatting, then fails with the error that names the repair.

- [#829](https://github.com/adelrodriguez/adamantite/pull/829) [`b1111d4`](https://github.com/adelrodriguez/adamantite/commit/b1111d42e34d73ad4d8af9e1e02c139a9c23dfa4) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fit the strict preset's overrides to declaration files and to the test files of the jest and vitest presets

  The strict lint preset now turns off `quality/no-unknown-parameters`, `quality/no-unknown-returns`, `quality/no-object-parameters`, and `quality/no-unsafe-dictionary-type` in `*.d.ts` files. A declaration file states the types of code that it does not hold, such as a built-in API or a package without types, so it cannot change those signatures.

  The strict preset also selects its test files with the `testFiles` globs of the jest and vitest presets, so the three presets agree on which files are test files. The override that allows a type assertion with a safety comment now also applies to `.js`, `.jsx`, `.mjs`, and `.cjs` test files. In a `__tests__` folder, it applies only to files with these extensions and the TypeScript extensions, so a `.vue`, `.svelte`, or `.astro` file in that folder now gets the strict rules for ordinary files.

- [#912](https://github.com/adelrodriguez/adamantite/pull/912) [`a8b16f1`](https://github.com/adelrodriguez/adamantite/commit/a8b16f1d0df2bbfc2b3fd7b9a43ac44ef767771c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report an import that reaches a protected file through a symlink in `adamantite/layers` and `adamantite/import-owners`

  Both rules now find an imported file by its real path. Before, an import through a folder link, such as `./link/api.ts` with `src/low/link` linked to `../high`, or through a source-file link, reached a higher layer or an owned module without a report. A path through `node_modules` keeps its package, so a bare import of a linked workspace package still matches its package name and stays outside every layer map. A project below a linked folder, such as `/tmp` on macOS, gets the same reports.

- [#910](https://github.com/adelrodriguez/adamantite/pull/910) [`eb93dd7`](https://github.com/adelrodriguez/adamantite/commit/eb93dd728fd0119893b6105957a50d15784d99c8) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Drop the checkout token and keep expressions out of the run script in the generated GitHub Actions workflow

  The workflow that `init` and `update` write now sets `persist-credentials: false` on `actions/checkout`, so the job token no longer stays in `.git/config` for the later steps. The run step reads the matrix command from a `COMMAND` environment variable instead of expanding `${{ matrix.command }}` into the shell script. zizmor 1.32.0 now reports no `artipacked` or `template-injection` finding for any package manager. `update` replaces a workflow that the project has not changed. A workflow that the project changed stays as it is.

## 0.47.0

### Minor Changes

- [#737](https://github.com/adelrodriguez/adamantite/pull/737) [`3707e0b`](https://github.com/adelrodriguez/adamantite/commit/3707e0bf0795c90b7c15da8bc37a4e4c5dc71617) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep the Adamantite job of the GitHub Actions workflow in a managed block

  The generated workflow now puts its job between `# ADAMANTITE:START` and `# ADAMANTITE:END` comments. Adamantite owns the jobs between the comments, and the project owns the rest of the workflow. You can rename the workflow file, such as to `checks.yml`, and add your own jobs outside the comments.

  - Doctor checks only the jobs in the managed block, in any file in `.github/workflows`.
  - Init updates the managed block when you did not change it, and keeps the rest of the file as you wrote it.
  - Doctor reports markers that do not make one block, such as a start comment without an end comment, or a managed block in more than one file.
  - A `.github/workflows/adamantite.yml` without the comments is still checked as a whole. Init adds the comments when the file is as an earlier release generated it.

- [#735](https://github.com/adelrodriguez/adamantite/pull/735) [`58f1f11`](https://github.com/adelrodriguez/adamantite/commit/58f1f11933c39f850858954f67f7f808a3f14f81) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add type resets to `adamantite/typescript`, and add `adamantite/tsconfig` for libraries

  `adamantite/typescript` now loads type resets that ship in the package. `JSON.parse()`, `response.json()`, and property reads on `localStorage` return `unknown` instead of `any`, `includes()` on a literal array accepts a wider value, and `.filter(Boolean)` removes falsy types. The resets started from [ts-reset](https://github.com/total-typescript/ts-reset) 0.7.0, which npm does not have yet. They also cover APIs that ts-reset leaves as `any`: `Object.values()` and `Object.entries()` on a type without an index signature, `Object.assign()` with more than three sources, `Object.getPrototypeOf()`, `Reflect.apply()`, `Reflect.construct()`, `eval()`, and the values of a `JSON.parse()` reviver. `adamantite/tsconfig` has the same strict options without the resets.

  `init` asks "Use an Adamantite TypeScript preset?" and then which preset to use. `--typescript` now takes a value: `--typescript typescript` or `--typescript tsconfig`. Doctor reports a package that extends `adamantite/typescript`, is not private, and declares `exports` or `types`, because its declaration files can name reset helper types that consumers do not have.

  To migrate:

  1. Fix the new type errors. Most are values from `JSON.parse()` or `response.json()` that the code used as a specific type. Parse them with a schema, or narrow them.
  2. In a library that publishes declaration files, replace `adamantite/typescript` with `adamantite/tsconfig` in `extends`.
  3. If the project already set up ts-reset, delete its `reset.d.ts` files, their `include` entries, and the `@total-typescript/ts-reset` dependency.
  4. Replace `--typescript` with `--typescript typescript` in scripts that run `adamantite init`.

  To keep the strict options without the resets, extend `adamantite/tsconfig`. List your files in `include`. A `files` list in your `tsconfig.json` replaces the preset's list and drops the resets, and the config still inherits the preset's `include` of every file below it. A solution config with `"files": []` and `references` that extends `adamantite/typescript` must also set `"include": []`, or extend `adamantite/tsconfig`.

- [#734](https://github.com/adelrodriguez/adamantite/pull/734) [`1faf7a4`](https://github.com/adelrodriguez/adamantite/commit/1faf7a4723bad828f42af08c5a2c59aceeea7979) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Set up the TypeScript preset without the `check` or `fix` script

  `init` now asks about the TypeScript preset whatever scripts you select, and the scripts question accepts no selection. `adamantite init --non-interactive --typescript` sets up only the preset. A non-interactive run needs at least one `--script` or `--typescript`. When you select no setup in an interactive run, `init` makes no changes.

  Doctor now checks `tsconfig.json` only when it extends `adamantite/typescript`. It no longer reports a missing `tsconfig.json` or a config that does not extend the preset, so a project that declined the preset gets no finding. Oxlint's type check runs without a `tsconfig.json`.

### Patch Changes

- [#739](https://github.com/adelrodriguez/adamantite/pull/739) [`5b12415`](https://github.com/adelrodriguez/adamantite/commit/5b12415bf8a347a6aa37f1ef5575e2c4394fc2ec) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Let a promise rejection callback take `error: unknown` in the strict preset

  `anti-slop/no-unknown-parameters` no longer reports the first parameter of a `.catch()` callback or of the rejection callback of `.then()`. A project that extends the core and strict presets can now write `.catch((error: unknown) => ...)`, which `typescript/use-unknown-in-catch-callback-variable` asks for. Before, every way to write the parameter got a report from one of the three rules.

- [#717](https://github.com/adelrodriguez/adamantite/pull/717) [`e68edd8`](https://github.com/adelrodriguez/adamantite/commit/e68edd850b7e513dca07cf1d1f666bfcdbf917a8) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the Doctor finding for array-valued `adamantite/layers` declarations

  No release accepted a layer as an array, such as `workspace: ["shared"]`, so the finding and its migration instructions could not apply to a working config. Doctor no longer parses the Oxlint config files to look for them. The README and the Adamantite skill no longer mention the migration.

- [#738](https://github.com/adelrodriguez/adamantite/pull/738) [`080f560`](https://github.com/adelrodriguez/adamantite/commit/080f560f12e4d26bf328a6fc2914dcb3a2e051f7) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Accept the lowercase hex literals that `adamantite fix` writes

  The core lint preset no longer enables `unicorn/number-literal-case`. The rule requires uppercase hex digits, such as `0xFF`, and Oxfmt always writes them in lowercase, such as `0xff`. A hex literal now passes both `adamantite fix` and `adamantite check`. Oxfmt still writes the `0x` prefix and the exponent in lowercase.

## 0.46.0

### Minor Changes

- [#536](https://github.com/adelrodriguez/adamantite/pull/536) [`e3e9cb5`](https://github.com/adelrodriguez/adamantite/commit/e3e9cb526a9dc45b1436583f8e0c6554bca2b14b) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `adamantite harden` to turn a project's coding standards into lint rules

  `adamantite harden` prints a Markdown prompt for a coding agent. The agent finds the coding standards that the project follows, drops the ones that a tool already enforces, and puts each remaining one at the highest level of enforcement that works: a custom rule when a rule can check it, and a line in `CODING_STANDARDS.md` when no rule can. The agent writes nothing until you approve the candidates.

  The prompt gives the agent these facts about the project:

  - The Oxlint config, the rules folders that its `custom()` calls load, and the instruction files. In a monorepo, the prompt lists them for each workspace package, and lists a rules folder that several configs load only once.
  - Each Markdown file that git tracks or does not ignore, except the changesets and the changelogs. The prompt marks the files that no chain of links or code-span paths from an `AGENTS.md` reaches, and each link to a missing file, and the agent reports them as discovery gaps.
  - The fix commits in the last 200 commits, or in the number of commits that `--commits` gives. A mistake that two fixes correct, or that the code still repeats, becomes a candidate, and the code before and after a fix become the cases of its rule.
  - The rules that the project already has, the disable comments of each rule, and the files that an override no longer needs. The agent reports the forms of a mistake that a rule misses, the files that an override glob misses, and the rules with many suppressions.

  Each candidate has its scope, a case that the rule must report, and a case that the rule must accept. The agent tries each rule on its cases with `adamantite rule try`, scores the candidates, and shows only the strong ones. A candidate that needs your choice goes to a separate Decisions list. A new rule stays at `error`, and an Oxlint override turns it off for the files that break it.

  In an interactive terminal, `harden` offers the same menu as `adamantite doctor`: hand off to an installed coding agent, copy the prompt, or do nothing. Without a terminal, it prints the prompt. After an agent session, `harden` runs Oxfmt and Oxlint as `adamantite check` does, and assesses the project as `adamantite doctor` does. It exits 1 and names the failed check when either one fails, or when the session added a link to a missing file. A copy of the prompt, or "do nothing", exits 0 without these checks.

  `--path` limits the session to one package or folder, and fails for a folder outside the project. `harden` stops before it prints the prompt when the project does not install the Adamantite version that runs the command, because the prompt offers the presets and rules of that version. The Adamantite skill documents `harden`.

- [#648](https://github.com/adelrodriguez/adamantite/pull/648) [`0a0ebeb`](https://github.com/adelrodriguez/adamantite/commit/0a0ebeb25e708128523db649d58737dd5f2d7a60) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `adamantite/lint/architecture` to load first-party rules without the other rules of `strict`

  The preset enables no rules by default. Configure `adamantite/layers` with your layer maps and
  `adamantite/import-owners` with your import owners. Select it with `init --preset architecture`
  or add it to the `extends` array of your Oxlint config. Existing `strict` configurations keep
  their behavior.

- [#594](https://github.com/adelrodriguez/adamantite/pull/594) [`69adf33`](https://github.com/adelrodriguez/adamantite/commit/69adf33d2ee44ec3ecec7290302bf05597a9a992) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fail `adamantite check` when Oxlint reports a warning

  A project with warnings, such as reports of the rules that a preset sets to `warn`, fails `check` after the update. Pass `--allow-warnings` to keep the old behavior. The flag changes only the lint stage, so `check --only format --allow-warnings` fails with "Invalid check options".

- [#653](https://github.com/adelrodriguez/adamantite/pull/653) [`8f47904`](https://github.com/adelrodriguez/adamantite/commit/8f479046a07ee0cd6efda4813220333d857b0ea8) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Load the managed React Doctor plugin through `react-strict`

  `react-strict` now checks effect cleanup, stale timers, discarded cleanup callbacks, loading
  flags left set after failed requests, and contexts or object URLs created during render.
  The general cleanup rule also covers observer cleanup and mismatched subscription callbacks.
  The upstream rule names stay under `react-doctor/*`.

  Init installs the pinned `oxlint-plugin-react-doctor` package when you select `react-strict`.
  Doctor and update maintain the package for that preset.

  The separate `adamantite/lint/react-doctor` preset is removed. Run `adamantite doctor` for
  its migration finding and repair prompt. The repair preserves project settings and rule
  overrides and keeps one `react-strict` entry when both presets were present.

- [#713](https://github.com/adelrodriguez/adamantite/pull/713) [`43cdc64`](https://github.com/adelrodriguez/adamantite/commit/43cdc642a83361e9ae83e36c002c4a95f17ab3e8) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the Doctor findings for the legacy `format` and monorepo scripts

  `adamantite doctor` no longer reports these leftovers of the `format` and `monorepo` commands that v0.41.0 deprecated:

  - A `format` script that runs `adamantite format`.
  - A `check:monorepo` or `fix:monorepo` script, or a script that starts with `adamantite monorepo`.
  - A GitHub Actions step or matrix entry that runs the `format` script with `--check`, a `check:monorepo` or `fix:monorepo` script, or `adamantite monorepo`.

  To upgrade a project from v0.40.0 or older, follow the migration notes for v0.41.0 in the changelog. In short, remove those scripts and workflow steps, run `check` and `fix` for formatting, and run `analyze` for Sherif, with custom Sherif flags in the `sherif` field of the root `package.json`.

- [#666](https://github.com/adelrodriguez/adamantite/pull/666) [`fc54500`](https://github.com/adelrodriguez/adamantite/commit/fc54500fbd4de1e0d1f8b5e41b13605934ca02c9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Enable the anti-slop-effect rules in the effect preset

  The `effect` preset now loads a vendored build of the `anti-slop-effect` plugin from [anti-slop](https://github.com/dmmulroy/anti-slop) and enables all of its rules:

  - `no-manual-tagged-construction` reports an object literal with a `_tag`. Use a tagged class, such as `Data.TaggedClass` or `Data.TaggedError`, or the `make` of a tagged Schema. Effect constructors that take `_tag` as input, such as `PlatformError.systemError`, stay allowed.
  - `no-manual-tag-comparison` reports a comparison or a `switch` on `_tag`. Use `Match.tag`, `Predicate.isTagged`, or a helper such as `Option.isNone`.
  - `no-manual-effect-error-tag` reports a broad `Effect.catch` handler that branches on `_tag`. Use `Effect.catchTag` or `Effect.catchReason`.
  - `prefer-effect-match` reports a chain of ternaries that compare one value with literals. Use `Match` or a lookup table.
  - `no-service-constructor-imports` reports a `make*` import from a project file outside tests. Import the Layer of the service instead.

  The project installs nothing extra.

  To upgrade an existing project:

  - Run `adamantite update` to install the new version.
  - Expect `adamantite check` to report the code that these rules describe. A plain union with a `_tag` field, such as `{ readonly _tag: "File"; readonly path: string }`, becomes one `Data.TaggedClass` for each variant. The core preset enables `no-redeclare`, so give the union type and its constructors different names.

- [#710](https://github.com/adelrodriguez/adamantite/pull/710) [`b676d35`](https://github.com/adelrodriguez/adamantite/commit/b676d354a58555bcf3a9c28f66c8c1f239d5bcf3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Publish only the documented lint preset imports

  The package now exports `adamantite/lint` and each documented `adamantite/lint/<preset>` import by
  name. Before, a wildcard export also made the implementation modules below
  `dist/presets/lint` importable, such as `adamantite/lint/plugin/options`,
  `adamantite/lint/plugin/rules/query-from-loader`, and the undocumented `adamantite/lint/core` alias. Node.js
  now rejects these paths with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The unused `main` field is removed,
  so the bare `adamantite` import stays unavailable.

  To upgrade an existing project, replace an import of `adamantite/lint/core` with
  `adamantite/lint`.

- [#585](https://github.com/adelrodriguez/adamantite/pull/585) [`2d617d7`](https://github.com/adelrodriguez/adamantite/commit/2d617d7099f1fec35a6de798e702b170e37a789f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/import-owners` rule to restrict an import to the files that own it

  The rule restricts an import to the files and folders that own it, such as `{ import: "giget", owners: ["src/lib/sources/repository/fetch.ts"] }`, and each
  message names the owners. A module covers its subpaths, `names` restricts only some exports, such
  as the `react-native` `Alert`, and owner paths are relative to the workspace root, so a monorepo
  can name an owner package such as `packages/utils`. An `import` that starts with `#`, `.`, or `/`
  names a file or folder of the project, such as `#lib/database.ts`, and the rule resolves each
  import to it, so a relative path to the same file counts too. An import of a `#` module as written
  also counts, so an alias that a workspace package declares still matches. The `strict` preset
  loads the rule, and the project turns it on with its owners.

- [#589](https://github.com/adelrodriguez/adamantite/pull/589) [`1199f9e`](https://github.com/adelrodriguez/adamantite/commit/1199f9ed9acf5ae841c2d62d9c2dc329a34123f5) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Install the Adamantite skill for coding agents in `adamantite init`

  One question asks whether to set up coding agents. A yes, or `--agents` in non-interactive mode, adds the `AGENTS.md` section and writes the skill to `.agents/skills`, which Codex, Cursor, Gemini CLI, and OpenCode read. Init also writes the skill to `.claude/skills` when the project has `.claude/`, and to `.grok/skills` when it has `.grok/`. The CLI bundles the skill and writes it directly, so the skill matches the running Adamantite version and needs no network, `npx`, or `node_modules` copy. `adamantite update` writes the skill again to each folder whose copy differs in any file, and removes the `adamantite` entry from `skills-lock.json`.

- [#553](https://github.com/adelrodriguez/adamantite/pull/553) [`888348c`](https://github.com/adelrodriguez/adamantite/commit/888348ce5c02bf4b9c6e28cb94da2d38a7bcf304) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/layers` rule to enforce one-way imports between folders

  Each layer lists the layers it can import in `imports`, and imports are transitive. Each layer can contain a child map
  in `layers`, with its own settings and a root derived from its containing folder. Declaration
  order does not change permissions. Every containing map remains an independent check.

  The rule resolves relative imports, `#` imports, and `tsconfig.json` paths. It reports unknown
  folders and duplicate concrete scopes. Each violation names the map's concrete root and
  declaration path and gives the repairs that its graph permits. The `architecture` and `strict`
  presets load the plugin, and the project enables the rule with its maps.

- [#646](https://github.com/adelrodriguez/adamantite/pull/646) [`d4d7547`](https://github.com/adelrodriguez/adamantite/commit/d4d7547404565fc263f30ac5d9459ebd7241b59f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Rename the `shadcn` preset to `tailwind`

  Replace imports from `adamantite/lint/shadcn` with `adamantite/lint/tailwind`, and use
  `--preset tailwind` in `adamantite init` commands. The old preset import and CLI option
  are removed. The managed package stays `@shadcn/lint`, with the same `shadcn/*` rule names,
  `settings.shadcn` keys, and rule behavior. Doctor reports the old preset import and gives
  migration instructions without changing the config.

  The Tailwind choice in init states that it installs `@shadcn/lint`.

- [#584](https://github.com/adelrodriguez/adamantite/pull/584) [`0307a7f`](https://github.com/adelrodriguez/adamantite/commit/0307a7f2f202c4158e28a48de545418ea7d4e844) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Require a reason on each lint suppression in the `strict` preset

  The new `adamantite/require-suppression-reason` rule reports an `oxlint-disable` or `eslint-disable` comment, including the `-line` and `-next-line`
  forms, that gives no reason after `--`, such as
  `// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A single `-` is not
  a reason. A project that selects `strict` gets a report on each suppression without a reason after
  the update.

- [#610](https://github.com/adelrodriguez/adamantite/pull/610) [`7637c46`](https://github.com/adelrodriguez/adamantite/commit/7637c46a640135dd1db1fc9571a66bdf99b92cd5) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `adamantite rule try` to check a rule setting against cases

  `adamantite rule try` lints cases in a copy of the project with one rule setting, and shows whether the rule reports each case. It exits 0 when each case is as expected, 1 when a case is not, and 2 when the trial is not evidence, such as for a rule that does not exist. The README command reference documents its case forms, rule settings, and exit codes.

- [#578](https://github.com/adelrodriguez/adamantite/pull/578) [`1560b92`](https://github.com/adelrodriguez/adamantite/commit/1560b92747a267ae602e4372ed07dd53475c93de) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `adamantite/rules/plugin` for the Oxlint authoring API and use `.adamantite/lint` as the default rules folder

  Import `definePlugin`, `defineRule`, `eslintCompatPlugin`, and the Oxlint authoring types from
  `adamantite/rules/plugin`. Import the rules-folder preset as `import custom from "adamantite/rules"`.
  The helpers come from Adamantite's pinned `@oxlint/plugins` dependency. `RuleTester` is at
  `adamantite/rules/testing`, which also exports the upstream test types.

  Move an existing `.adamantite/rules` folder to `.adamantite/lint`, or keep it with
  `custom({ dir: ".adamantite/rules" })` and `rule add --dir .adamantite/rules`. For a folder at
  another path, set its `oxlint.entry` patterns in the Knip config.

  The old named authoring imports from `adamantite/rules` and the `adamantite/lint/custom`
  import are removed. Run `adamantite doctor` for migration instructions. It reports old
  imports and default folders without changing files. The instructions preserve rule behavior,
  plugin names, severity, and options.

- [#557](https://github.com/adelrodriguez/adamantite/pull/557) [`6a94929`](https://github.com/adelrodriguez/adamantite/commit/6a94929389d1f86353690f20cca15a12824d8409) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `RuleTester` at `adamantite/rules/testing`, and `adamantite rule test` to run saved rule tests

  `RuleTester` runs valid and invalid cases against a custom rule. It connects to `node:test`, so a failed case makes the test command fail, also in a Bun project that runs the command with Node.js. `oxlint` is an optional peer dependency. Coding agents use `RuleTester` with temporary cases from stdin or a temporary file while they write custom rules, and remove the cases and fixtures before handback. The project keeps only the rules, their runtime helpers, and the required config.

  To keep a test, run `adamantite rule test add [name]`. Without a name, it lists the existing rules to select from. A named rule must already exist. The command writes `<name>.test.ts` beside the rule, and `--path <file>` chooses another test path. Run saved tests with `adamantite rule test`, or give it `--path` for a test saved elsewhere. The plugin loader and Doctor do not treat `.test.*` files as rules.

  Saved tests use `node:test`, so exclude them from Vitest and Jest discovery. The command and the README explain that setup. The test template passes the shipped lint presets for both test runners.

- [#666](https://github.com/adelrodriguez/adamantite/pull/666) [`fc54500`](https://github.com/adelrodriguez/adamantite/commit/fc54500fbd4de1e0d1f8b5e41b13605934ca02c9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Move the anti-slop rules into the strict preset, and retire the antislop preset

  The `strict` preset now loads the vendored anti-slop rules, updated to anti-slop commit `13909c9`. They report `unknown` in signatures, loose dictionary types, `typeof` checks outside type predicates, `Reflect.get` and `Reflect.apply`, module mocks, adjacent `filter` and `map` passes, accumulator copies in `reduce`, and missing blank lines between statement groups.

  These rules are new in this anti-slop version:

  - `no-array-filter-map` reports a `filter` and a `map` chained on one array, which walk the array twice. Use a single `flatMap`, or `.values().filter().map().toArray()` where the runtime supports iterator helpers.
  - `no-reduce-accumulator-copy` reports a `reduce` callback that copies its accumulator on each step with `Object.assign`, `Array.from`, `concat`, or another array copy method. Mutate an accumulator that the callback owns and return it.
  - `require-readable-spacing` requires a blank line around multi-line statements, declarations, and blocks, and before `return`, `if`, and loop statements. Consecutive single-line bindings stay together. The rule has an autofix that only adds blank lines.

  The assertion rules `require-safety-comment-for-type-assertion`, `no-chained-type-assertions`, and `no-widen-then-assert` now apply only in test files. Outside tests, `typescript/consistent-type-assertions` already bans each assertion, so an assertion gets one report instead of several.

  `adamantite/lint/antislop` no longer exists, and `init` no longer offers it.

  To upgrade an existing project:

  - Run `adamantite update` to install the new version.
  - If `oxlint.config.ts` imports `adamantite/lint/antislop`, replace it with `adamantite/lint/strict`, or remove it when the config already imports `strict`. `adamantite doctor` reports this import. Settings for `anti-slop/*` rules keep working, with one exception: `strict` sets the three assertion rules in an override for test files, which takes priority over top-level `rules`. Move a project setting for those rules into an `overrides` entry with `files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"]`.
  - Run `adamantite fix` to add the blank lines that `require-readable-spacing` reports.
  - Expect `adamantite check` to report the code that the other new rules describe. A project that used `strict` without `antislop` gets reports from all the anti-slop rules.

- [#595](https://github.com/adelrodriguez/adamantite/pull/595) [`5dffe50`](https://github.com/adelrodriguez/adamantite/commit/5dffe508a8333aa0f9cea82b4daee9a3061db15b) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Move `no-console` from the core preset to the `strict` preset as an error

  `console.info` stays allowed. A project that selects `strict` gets a lint error on each other
  console call after the update. The repair is a fix, or a suppression with a reason, such as
  `// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A project without
  `strict` no longer gets `no-console` reports.

- [#593](https://github.com/adelrodriguez/adamantite/pull/593) [`5c39759`](https://github.com/adelrodriguez/adamantite/commit/5c397591c84a41b51b3ef99bf306ced9900e882d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report `TODO`, `FIXME`, `XXX`, and `HACK` comments in the `strict` preset

  The `strict` preset turns on `no-warning-comments`. It reports a comment that starts with
  `TODO`, `FIXME`, `XXX`, or `HACK`. A project that selects `strict` gets a report on each such
  comment after the update. The repair is a fix to the code, or an issue in the project's issue
  tracker in place of the comment.

- [#608](https://github.com/adelrodriguez/adamantite/pull/608) [`587eb6c`](https://github.com/adelrodriguez/adamantite/commit/587eb6c83079b8195111ea3fc6797ab1a07a0979) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Run Oxlint with the Effect builds of `@effect/tsgo` without patching `node_modules`

  `adamantite check` and `fix` now start Oxlint through `node_modules/adamantite/dist/oxlint.js`. When the project installs `@effect/tsgo`, this entry loads the Effect build of the Oxlint binding for the installed Oxlint version. Nothing patches `node_modules` anymore, so the effect preset works after any install, also with a read-only package store, and a production-only install no longer fails at the `prepare` script.

  `adamantite init` and `adamantite update` no longer run `effect-tsgo patch`, and `init` no longer writes a `prepare` script. The `adamantite prepare` command is removed. The VS Code integration sets `oxc.path.oxlint`, and the Zed integration sets `lsp.oxlint.binary`, so editors start the same entry.

  `adamantite doctor` reports an existing VS Code or Zed settings file that does not start Oxlint through the entry. Each finding gives the current value and the required setting. Doctor does not change the settings files.

  To upgrade an existing project:

  - Remove `adamantite prepare` from the `prepare` script in `package.json` before you install, and delete the script when nothing else is left. The command no longer exists, so a `prepare` script that still runs it makes the install fail. `adamantite doctor` does not report it.
  - Point your editor at the entry. In `.vscode/settings.json`, set `"oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js"`. In `.zed/settings.json`, set `lsp.oxlint.binary` to `{ "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp"] }`. `adamantite update` does not change editor settings.
  - Replace a plain `oxlint` call, such as in a lint-staged config, with `adamantite check --only lint`. Plain `oxlint` cannot load the effect preset.
  - Run `adamantite init --non-interactive --script check --preset effect --editor vscode --editor zed --install-extensions` for Effect hovers, refactors, and semantic quick fixes. VS Code uses a native SDK copy in `node_modules/.cache/adamantite/effect/`; Zed starts the installed upstream CLI. The language service enables diagnostics, and the managed editor settings hide duplicate Oxlint Effect reports.
  - After a fresh install or dependency update, run `adamantite init --non-interactive --script check --editor vscode` to prepare or refresh the SDK cache. Doctor reports missing settings and a missing or stale SDK without changing files. Installed package files stay unchanged, and install scripts can stay disabled.

- [#620](https://github.com/adelrodriguez/adamantite/pull/620) [`94783b5`](https://github.com/adelrodriguez/adamantite/commit/94783b5cac2bd8e842009a39944dec24b5c95ace) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Run the type-aware rules on tsrs instead of oxlint-tsgolint

  Oxlint's type-aware rules now run on [tsrs](https://github.com/oxc-project/tsrs). `adamantite init` and `adamantite update` install the pinned `tsrs` 0.21.0-ts7.1.0-beta, and `adamantite check`, `adamantite fix`, and the editor settings start it through the Oxlint entry `dist/oxlint.js`. With the `effect` preset, the entry starts the Effect build of tsrs that `@effect/tsgo` ships, so the `effecttsgo` rules run on tsrs too.

  On this repository, the full lint takes about 45% less time on tsrs.

  To upgrade an existing project:

  - Run `adamantite update` to install `tsrs`.
  - Remove `oxlint-tsgolint` from `package.json`, and install again. `adamantite doctor` reports it while it stays.
  - Expect small differences in type-check results. tsrs 0.21.0 ports TypeScript 7.1 beta, so a project that pins TypeScript 7.0 can get results that differ from `tsc`.
  - A plain `oxlint --type-aware` call no longer finds a backend. Run `adamantite check --only lint` instead.
  - On Windows ARM64, the type-aware rules no longer run, because tsrs has no Windows ARM64 build yet. [oxc-project/tsrs#903](https://github.com/oxc-project/tsrs/pull/903) adds it for a later tsrs release. Until then, a project that lints on Windows ARM64 can stay on the previous Adamantite version, which runs oxlint-tsgolint.

- [#583](https://github.com/adelrodriguez/adamantite/pull/583) [`2792b65`](https://github.com/adelrodriguez/adamantite/commit/2792b65e289f61eca096fa93e001a865ba3248e4) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Allow only erasable syntax in the `adamantite/typescript` preset

  The preset sets `erasableSyntaxOnly`, so TypeScript reports `enum`, a
  `namespace` with values, parameter properties, and `import x = require()`. Node.js type stripping
  runs only erasable syntax, so TypeScript now reports this syntax before a run fails. This can break an existing project: a project
  that uses this syntax fails type checking after the update. Rewrite the code, for example an
  `enum` as an `as const` object, or set `"erasableSyntaxOnly": false` in the project's own
  `tsconfig.json`.

- [#605](https://github.com/adelrodriguez/adamantite/pull/605) [`b89bbe1`](https://github.com/adelrodriguez/adamantite/commit/b89bbe159101584c517f20e1d8388f0952fc2c22) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update `@effect/tsgo` to 0.67.3, and enable 14 new rules in the effect preset

  The effect preset enables these new `@effect/tsgo` rules:

  - `effect-try-without-catch` reports `Effect.try` and `Effect.tryPromise` without a `catch` handler, whose failures become a generic `UnknownError`. Use the object form `{ try, catch }` and map the cause to a typed error.
  - `global-json-in-effect` reports `JSON.parse` and `JSON.stringify` inside Effect generators, because they throw instead of failing with a typed error. Use `Schema.fromJsonString(schema)` with `Schema.decodeEffect` or `Schema.encodeEffect`.

  The other new rules report a combinator or construct that has a direct replacement:

  - `effect-succeed-with-undefined` reports `Effect.succeed(undefined)`. Use `Effect.undefined`.
  - `fail-cause-to-constructor` reports `Effect.failCause` or `Effect.failCauseSync` around a single `Cause.fail` or `Cause.die`. Use `Effect.fail`, `Effect.die`, `Effect.failSync`, or `Effect.dieSync`.
  - `flat-map-identity-to-flatten` reports `Effect.flatMap` with a callback that returns its parameter. Use `Effect.flatten`.
  - `manual-metric-tap-to-track` reports an `Effect.tap`, `Effect.tapError`, or `Effect.tapDefect` that only updates a metric. Use `Effect.trackSuccesses`, `Effect.trackErrors`, or `Effect.trackDefects`.
  - `map-const-to-as` reports an `Effect.map` callback that ignores its input and returns a constant. Use `Effect.as`.
  - `map-map-error-to-map-both` reports `Effect.map` and `Effect.mapError` as adjacent steps of one pipe. Use `Effect.mapBoth`.
  - `map-some-catch-no-such-element` reports `Effect.map(Option.some)` followed by a `catchTag` of `NoSuchElementError` that succeeds with `Option.none()`. Use `Effect.catchNoSuchElement`.
  - `match-boolean-to-is-success` reports `Effect.match` that folds to `true` and `false`. Use `Effect.isSuccess` or `Effect.isFailure`.
  - `match-to-result-or-option` reports `Effect.match` handlers, or a map step followed by a catch step, that only turn the outcome into a value. Use `Effect.result` or `Effect.option`.
  - `provide-merge-all-to-array` reports `Effect.provide(Layer.mergeAll(a, b))`. Use `Effect.provide([a, b])`.
  - `result-match-to-from-result` reports a `Result.match` that only turns a success into `Effect.succeed` and a failure into `Effect.fail`. Use `Effect.fromResult`.
  - `suspend-fail-to-fail-sync` reports `Effect.suspend` around a single `Effect.fail` or `Effect.die`. Use `Effect.failSync` or `Effect.dieSync`.

  The preset does not enable `global-json`, which reports `JSON` calls outside Effect code, or the style preferences `type-union-to-schema-union` and `yield-in-call-argument`.

  To upgrade an existing project:

  - Run `adamantite update` to install the new version.
  - Expect `adamantite check` to report the code that these rules describe.
  - `@effect/tsgo` 0.67.3 has Effect builds for Oxlint 1.88.0, 1.89.0, 1.90.0, and 1.91.0.
  - For Effect editor features, run `adamantite init --non-interactive --script check --preset effect --editor vscode --editor zed`. The editor setup uses the installed Effect compiler without a TypeScript patch.

- [#619](https://github.com/adelrodriguez/adamantite/pull/619) [`33f2dc3`](https://github.com/adelrodriguez/adamantite/commit/33f2dc3f8a2a6cf82f04d7b003a2885c40cb20f2) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Oxlint to 1.91.0 and oxfmt to 0.76.0

  The runtime dependency `@oxlint/plugins` moves to 1.91.0 with Oxlint.

  To upgrade an existing project:

  - Run `adamantite update` to install the new versions.
  - Expect `adamantite check` to report more code. Oxlint 1.89.0 fixed many rules so that they report cases they missed before. For example, `eslint/sort-keys` now checks computed keys, and `unicorn/prefer-string-replace-all` now resolves a regular expression in a variable.
  - Expect `adamantite fix` to format HTML files differently. oxfmt 0.76.0 formats them with its own HTML formatter (oxc-project/oxc#28273).

### Patch Changes

- [#555](https://github.com/adelrodriguez/adamantite/pull/555) [`8f8b157`](https://github.com/adelrodriguez/adamantite/commit/8f8b15700e636d51f2444b4d76114339d97f5f4f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop `adamantite analyze` from reporting custom rule files as unused

  The `adamantite/analyze` preset adds the rule files and optional `.test.*` files in `.adamantite/lint/` as Knip entry files, in the root and in each workspace package, and keeps Knip's default entry files. Knip still reports a helper file that starts with `_` when no file imports it.

- [#682](https://github.com/adelrodriguez/adamantite/pull/682) [`48d8b7d`](https://github.com/adelrodriguez/adamantite/commit/48d8b7d8e9717de2acb453a9143d980519b326fa) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop concurrent lint runs from loading an empty or foreign custom rules module

  `custom()` wrote its entry module in place, so an Oxlint process that loaded the module during another process's write could read an empty file and fail to load the custom rules. This happens when a monorepo task runner lints several packages at once. Two installed Adamantite copies that load the same rules folder also wrote the same file, so a run could load the rules through the other copy. `custom()` now writes the module to a temporary file and renames it into place, and each Adamantite copy gets its own module file.

- [#678](https://github.com/adelrodriguez/adamantite/pull/678) [`4a9fc01`](https://github.com/adelrodriguez/adamantite/commit/4a9fc01d78ca86f4bb211dc7d522ad34497dde7a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read pnpm `catalog:` versions instead of reporting the package as outdated

  `adamantite doctor` compared each managed package's specifier in `package.json` as text, so `"oxlint": "catalog:"` always read as outdated, and Doctor failed on a correct setup. `adamantite update` then ran `pnpm add oxlint@<version>`, which replaced `catalog:` with a pinned version and left the catalog out of sync with the other packages.

  Doctor now reads the version from the `catalog` or `catalogs` of `pnpm-workspace.yaml`. An outdated catalog entry gets a finding that tells you to change the catalog, and `update` leaves it alone. A specifier whose version Adamantite cannot read, such as `npm:`, `link:`, or a range like `>=1.0.0`, gets a warning instead of an "Outdated" finding.

- [#666](https://github.com/adelrodriguez/adamantite/pull/666) [`fc54500`](https://github.com/adelrodriguez/adamantite/commit/fc54500fbd4de1e0d1f8b5e41b13605934ca02c9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Give each invalid config finding the repair for its reason

  Doctor reported the same goal for every invalid `oxlint.config.ts`: set the three type-aware options to `true`. When the config exported a variable, or did not parse, that goal did not fix the finding. Each reason now has its own goal. Doctor asks to export the config object literal directly, or to fix the syntax errors. For an invalid Oxfmt or Knip config that does not parse, Doctor asks to fix the syntax errors in place of adding the preset.

- [#597](https://github.com/adelrodriguez/adamantite/pull/597) [`0c0962e`](https://github.com/adelrodriguez/adamantite/commit/0c0962e9be22c0ba279b744f52dfe7e16683754d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a missing `AGENTS.md` in `adamantite doctor`

  Doctor reports a project that has managed scripts and no `AGENTS.md` at its root. `AGENTS.md` is where coding agents start, and it points to the other documentation of the project. In a monorepo, Doctor checks only the root. The finding gives the `adamantite init --agents` command as one way to create the file.

- [#572](https://github.com/adelrodriguez/adamantite/pull/572) [`7b3fd8d`](https://github.com/adelrodriguez/adamantite/commit/7b3fd8d19d43eaf52fd74a0da7d6ded8beffb951) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Check the rules folders of a `custom()` call whose `name` Doctor cannot read

  A `custom()` call whose `name` is not a string literal turned off Doctor's check for rules folders that no `custom()` call loads, and its warning said that Doctor did not check the folder. Now only a `dir` that is not a string literal turns off that check, and a `name` that is not a string literal gets its own warning.

- [#556](https://github.com/adelrodriguez/adamantite/pull/556) [`fff64fd`](https://github.com/adelrodriguez/adamantite/commit/fff64fdab2b02bab17f642ed54dd03dbd20e8766) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Resolve Oxlint config imports in Doctor as Node.js does

  Doctor resolves the imports of an Oxlint config with `oxc-resolver`, as Node.js does when it loads the config, and now also follows `#` imports. A workspace package resolves after an install. Before the install, Doctor warns that it cannot resolve the import and says to install the dependencies.

- [#626](https://github.com/adelrodriguez/adamantite/pull/626) [`99533e0`](https://github.com/adelrodriguez/adamantite/commit/99533e0165f8cee62d95723ddcd9a34cd406991b) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report in Doctor when the installed packages cannot run Oxlint

  Doctor resolves the Oxlint runtime as `adamantite check` and the editors do, without starting tools or loading native code. It reports missing declared packages, missing stock native files, and unsupported `@effect/tsgo` builds for the installed Oxlint, tsrs, or platform. Local bindings and `TSRS_BINARY` overrides remain supported. A project whose dependencies are not fully installed now gets these findings, so run Doctor after the install.

- [#685](https://github.com/adelrodriguez/adamantite/pull/685) [`b8bedec`](https://github.com/adelrodriguez/adamantite/commit/b8bedec81a634c94f48f419a7f1da2e6bedcb447) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop a second rule file from silently replacing a custom rule with the same name

  A rules folder with `no-foo.js` and `no-foo.ts` loaded only one of them, chosen by the order of the folder listing, so a rule could disappear without an error. `custom()` now fails the lint run with a message that names both files. `adamantite rule add no-foo` also refuses to write `no-foo.ts` when a rule file with another extension, such as `no-foo.js`, already exists.

- [#672](https://github.com/adelrodriguez/adamantite/pull/672) [`57ce625`](https://github.com/adelrodriguez/adamantite/commit/57ce6253aad48d50eaf92806bebda6f80fb8e552) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop the effect preset from reporting Effect calls as array method mistakes

  The core preset turns on `unicorn/no-array-callback-reference` and `unicorn/no-array-method-this-argument`. Both rules match an array method by its name only, so they reported ordinary Effect code, such as `Option.some(value)` and the data-first `Array.findLast(values, predicate)`. The `effect` preset now turns both rules off. A project without the `effect` preset keeps them.

- [#657](https://github.com/adelrodriguez/adamantite/pull/657) [`25074f9`](https://github.com/adelrodriguez/adamantite/commit/25074f95e828bc777af7c70dd087ee58aa411d3b) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Clarify CLI help, prompts, and errors

  The preset hints in `adamantite init` are shorter, so most fit on one line in an 80-column terminal. Each managed-plugin choice names the package that it installs, and the Effect hint no longer says that `init` patches Oxlint and TypeScript.

- [#574](https://github.com/adelrodriguez/adamantite/pull/574) [`463c1d9`](https://github.com/adelrodriguez/adamantite/commit/463c1d90e344b48fd70bdb734e16d5d262102e69) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ask about a GitHub Actions workflow in `init` only when Adamantite can write one

  An interactive `init` asked the question for every package manager, and then skipped the workflow with a warning when the answer was yes and Adamantite could not generate a workflow for the detected package manager. Now it says that the package manager is not supported and does not ask.

- [#677](https://github.com/adelrodriguez/adamantite/pull/677) [`f1fdfed`](https://github.com/adelrodriguez/adamantite/commit/f1fdfed6779ad5ebcb92ad676d83b048613231d9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Write `AGENTS.md` and the CI workflow for every script that `package.json` manages

  When `adamantite init` ran again with fewer `--script` flags, it rewrote the Adamantite section of `AGENTS.md` and the workflow matrix without the scripts from earlier runs, although `package.json` still had them. Both now list every script that runs an Adamantite command. A conflicting script that `init` kept, such as `"check": "eslint ."`, is no longer listed, because it does not run Adamantite. When no CI script runs Adamantite, `init` writes no workflow and says so.

- [#703](https://github.com/adelrodriguez/adamantite/pull/703) [`c6baa8b`](https://github.com/adelrodriguez/adamantite/commit/c6baa8b2b6db9b9d3c196fb159eb38fe5f6a327e) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep Sherif in the terminal's process group when `adamantite analyze` runs it

  Sherif reads the terminal when `adamantite analyze --fix` asks which version to keep, but it started in a new session, so terminal signals such as Ctrl-C and window resizes did not reach it. Each tool that reads the terminal now starts in Adamantite's process group, as coding agents already did.

- [#675](https://github.com/adelrodriguez/adamantite/pull/675) [`30bbbf3`](https://github.com/adelrodriguez/adamantite/commit/30bbbf3be33c766119f044f02f566ce73340e761) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep a GitHub Actions workflow that the project changed when `init` runs again

  `adamantite init --github-actions` rewrote `.github/workflows/adamantite.yml` from the template, so a second run deleted the project's own branches, steps, and runner settings. `init` now rewrites the workflow only when it is still a workflow that Adamantite generated. It keeps any other workflow, including one that runs `adamantite rule test` through a package script, and tells you to run `adamantite doctor` for the updates that the workflow needs.

- [#674](https://github.com/adelrodriguez/adamantite/pull/674) [`c0b2255`](https://github.com/adelrodriguez/adamantite/commit/c0b2255b46d315b9b2f1510df1de4e08d2ea465c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep the project's editor settings when `init` updates VS Code or Zed

  `adamantite init --editor vscode` and `--editor zed` replaced settings that the project had changed, such as `editor.formatOnSave`, `oxc.typeAware`, or Zed's `format_on_save`, with Adamantite's defaults. A second run of `init` reset them again. The update now keeps every value that the project sets, also `null`, and changes only the settings that `adamantite doctor` checks: the Oxlint entry, and the Effect language server settings when the project uses `@effect/tsgo`. In Zed, the project's formatter entries now come before Adamantite's.

- [#680](https://github.com/adelrodriguez/adamantite/pull/680) [`87e31ee`](https://github.com/adelrodriguez/adamantite/commit/87e31eec031a625e57665bda470f241b39805f58) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a `custom({ dir })` rules folder that does not exist

  When `custom()` names a rules folder that does not exist, it returns an empty config, so Oxlint runs none of the custom rules and `adamantite check` still passes. `adamantite doctor` now reports such a call with the folder and the config file that names it. A `custom()` call without `dir` stays quiet until the project writes its first rule in `.adamantite/lint`.

- [#684](https://github.com/adelrodriguez/adamantite/pull/684) [`59b9bcf`](https://github.com/adelrodriguez/adamantite/commit/59b9bcf61efffc6f1d97ee0a9bee25a656b52ea6) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a `package.json` with an unexpected shape instead of crashing

  A `package.json` that held `null`, an array, or a field with the wrong type, such as `"scripts": "build"`, made `adamantite doctor`, `init`, `update`, and `check` crash with a JavaScript stack trace. Adamantite now checks the fields it reads, and stops with a message that names the file and the field.

- [#592](https://github.com/adelrodriguez/adamantite/pull/592) [`21a4461`](https://github.com/adelrodriguez/adamantite/commit/21a4461b5ecdeb5fadf15e9647cd8f8cdb91e9fd) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Read the GitHub Actions workflow and `pnpm-workspace.yaml` with a YAML parser

  Doctor now parses the Adamantite GitHub Actions workflow as YAML. It reads the `run` of each job
  step, the `command` of each matrix `include` entry, and the `node-version` input of each step, so
  it also finds a step in flow style, such as `- { name: Check, run: pnpm run check }`, and it
  ignores text in comments. Doctor treats a workflow that does not parse as a workflow that runs no
  commands. Adamantite also parses `pnpm-workspace.yaml` as YAML to find the workspace packages.
  Adamantite now depends on `effect` 4.1.2, whose YAML parser keeps tabs in block scalars and reads
  flow lists over several lines.

- [#681](https://github.com/adelrodriguez/adamantite/pull/681) [`2be0f59`](https://github.com/adelrodriguez/adamantite/commit/2be0f5961c3054db3b69a3a592b45c1ff42a18aa) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Write the `custom()` entry module to a temporary folder that only you can write

  When no writable `node_modules` folder is above a rules folder, `custom()` wrote its entry module to `adamantite` in the OS temporary directory, and Oxlint then imported it. On a system where users share `/tmp`, another user could create that folder first and replace the module, so Oxlint would run their code as you. The fallback is now `adamantite-<uid>`, which `custom()` creates with access for the current user only. `custom()` refuses that folder when another user owns it or can write to it.

- [#541](https://github.com/adelrodriguez/adamantite/pull/541) [`70611d9`](https://github.com/adelrodriguez/adamantite/commit/70611d965feaa6b68b3a6bcf0cd315b141a937a9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop writing an `AGENTS.md` to the rules folder in `adamantite rule add`

  The authoring guidance lives only in the "Custom rules" section of the Adamantite skill, and `rule add` and the `AGENTS.md` section that `init` writes point to it. An existing `.adamantite/rules/AGENTS.md` stays in place, and you can delete it.

- [#683](https://github.com/adelrodriguez/adamantite/pull/683) [`6ea750a`](https://github.com/adelrodriguez/adamantite/commit/6ea750a1140fd182d73a53cd6e7f47468edbd35d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Show a failed or cancelled step as failed in the terminal

  A step that failed, such as `Failed to update dependencies`, ended with the same green check mark as a step that succeeded, and a step that you stopped with Ctrl-C did too. A failed step now ends with an error mark, and a stopped step ends with a cancel mark. The editor extension install and the coding agent check now also say which step failed.

- [#651](https://github.com/adelrodriguez/adamantite/pull/651) [`0cf1817`](https://github.com/adelrodriguez/adamantite/commit/0cf1817362b7203f3455fb1021d28b796b7f340b) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Give Adamantite's agent instructions task guides and explicit verification checks

  The skill now links to separate setup, preset repair, and custom-rule guides. It corrects
  the Effect diagnostics setting, removes obsolete update instructions about patching Oxlint
  and TypeScript, and supplies complete TypeScript configuration examples.

  The Doctor prompt gives each step a completion check, reports missing evidence, and separates
  verified results from blocked work. Init points agents to the shipped skill and the workspace's
  managed scripts.

- [#686](https://github.com/adelrodriguez/adamantite/pull/686) [`bdc302d`](https://github.com/adelrodriguez/adamantite/commit/bdc302d184f2162ddfc145a54bab36e71e113666) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Report a file that Adamantite cannot read instead of treating it as missing

  Some reads treated a permission error like a missing file. An unreadable `oxlint.config.ts` in a workspace package made `adamantite doctor` use another config and suggest the wrong repair. An unreadable `pnpm-workspace.yaml` made `adamantite analyze` skip Sherif. These commands now stop and name the file that they cannot read. A missing file, and a folder in place of a file, are still treated as absent.

- [#573](https://github.com/adelrodriguez/adamantite/pull/573) [`319e19e`](https://github.com/adelrodriguez/adamantite/commit/319e19e2bcbf64ff001b15e68a48bd744245e286) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Find the workspace packages that `package.json` declares when `pnpm-workspace.yaml` holds only settings

  When `pnpm-workspace.yaml` held only settings, such as `allowBuilds`, Adamantite treated the project as a monorepo but found no workspace packages in it, so Doctor skipped the configs and rules folders of the packages.

## 0.45.0

### Minor Changes

- [#520](https://github.com/adelrodriguez/adamantite/pull/520) [`0089968`](https://github.com/adelrodriguez/adamantite/commit/008996873ebcd779d038a803ec38fce2caf1c0a3) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Scope the `jest` and `vitest` presets to test files. A config that extends a test preset now gets
  its rules only for the files that the test runner runs as tests by default, so rules such as
  `vitest/require-hook` no longer report scripts and library code. Each preset exports these files as
  `testFiles`. To use other files or change a rule, use the preset in an override of your own:
  `{ files: [...testFiles, "e2e/**/*.ts"], plugins: vitest.plugins, rules: { ...vitest.rules } }`. A
  top-level `rules` entry no longer changes a test rule in test files.

## 0.44.0

### Minor Changes

- [#516](https://github.com/adelrodriguez/adamantite/pull/516) [`a0bf5cf`](https://github.com/adelrodriguez/adamantite/commit/a0bf5cf6236d8887bda598e908ad255642eab99f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Oxlint and `@effect/tsgo`, and enable five new rules in the effect preset

  Update the managed tooling versions: Oxlint 1.88.0, oxlint-tsgolint 7.0.2004, and `@effect/tsgo` 0.54.0. Also update the runtime dependency `@oxlint/plugins` to 1.88.0.

  The effect preset enables these new `@effect/tsgo` rules:

  - `error-payload-shadows-name` reports an error payload field named `name`. The field replaces the error's own name, so logs and `String(error)` show the field value instead of the error type.
  - `schema-class-object-literal` reports an object literal that is checked as a Schema class instance. The object has no class prototype, so `instanceof`, methods, and encoding can fail.
  - `schema-class-missing-brand` reports a Schema class, error, or Opaque class without a brand type argument. Without a brand, TypeScript accepts structurally compatible values as instances.
  - `effect-sleep-zero-to-yield-now` reports `Effect.sleep(0)`. Use `Effect.yieldNow`.
  - `flat-map-to-tap` reports a `flatMap` or `andThen` callback that runs an effect and returns its parameter unchanged. Use `Effect.tap`.

  `adamantite rule add` now names its error `InvalidRuleName` when the rule name is not kebab-case. Before, the error took the rule name as its name.

  To upgrade an existing project:

  - Run `adamantite update`. It installs the new versions and patches them again.
  - Expect `adamantite check` to report Schema classes without a brand. Add `{ readonly brand: unique symbol }` as the second type argument, or add `{}` to keep the class structural.
  - Oxlint 1.88 compares keys with ESLint's `natural-compare` in `sort-keys` with `natural: true`, which the core preset sets ([oxc#27579](https://github.com/oxc-project/oxc/pull/27579)). `adamantite check` can report different objects.
  - `@effect/tsgo` 0.54.0 patches TypeScript 7.0.2 and `7.1.0-dev.20261018.1`. With another TypeScript version, the `prepare` script fails. Install one of those versions.

### Patch Changes

- [#519](https://github.com/adelrodriguez/adamantite/pull/519) [`192f0b4`](https://github.com/adelrodriguez/adamantite/commit/192f0b43f2ee6ac3600635025add95483989253f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Document how pnpm 12.11 and later link the Adamantite agent skill from the installed package. Create an agent skill directory, such as `.claude/skills`, run `pnpm approve` after the install, and the linked skill matches the installed Adamantite version.

- [#515](https://github.com/adelrodriguez/adamantite/pull/515) [`326df83`](https://github.com/adelrodriguez/adamantite/commit/326df83e3e7dd69155c8f79dd462bb5c11872012) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update the runtime dependencies `effect`, `@effect/platform-node`, and `@effect/platform-node-shared` to 4.0.5.

  Effect 4.0.2 and later tag each module as stable or unstable. The unstable modules include `effect/FileSystem`, `effect/Path`, and all modules in `@effect/platform-node` and `@effect/vitest`. With the effect preset, `effecttsgo/unstable-api-usage` reports each use of them after you update Effect. To use them on purpose, list them in `allowedUnstableApis` in the `@effect/language-service` entry of `tsconfig.json`. An entry can be a module, such as `effect/Path`, or a full package, such as `@effect/vitest`.

- [#514](https://github.com/adelrodriguez/adamantite/pull/514) [`214b5b1`](https://github.com/adelrodriguez/adamantite/commit/214b5b1adf5b1b3722c0a1d0c62a6485608f94f2) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update the managed tooling versions: Oxfmt 0.73.0, Knip 6.42.0, `oxlint-plugin-react-doctor` 0.9.18, and `@shadcn/lint` 0.2.1. Also update the runtime dependency `oxc-parser` to 0.154.0.

  Run `adamantite update` to install the new versions. Oxfmt 0.73 sorts the imports in Markdown code blocks, so `adamantite fix --only format` can change existing Markdown files after the update.

## 0.43.1

### Patch Changes

- [#512](https://github.com/adelrodriguez/adamantite/pull/512) [`25fa5e3`](https://github.com/adelrodriguez/adamantite/commit/25fa5e3bffa47df50b293d5321adcca0b106639a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep the `adamantite` dependency that a project already has when `adamantite init` runs. Before, `init` installed `adamantite` from the registry every time, which replaced a pinned version, a `file:` path, or a workspace link with the latest published version. `init` still installs the pinned Oxlint, Oxfmt, Knip, and Sherif versions.

- [#493](https://github.com/adelrodriguez/adamantite/pull/493) [`b0dfe2a`](https://github.com/adelrodriguez/adamantite/commit/b0dfe2a47b8bb5ee005a5e838f7f95ebf5fcfb7c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep comments and formatting when `adamantite init` updates an existing JSON file. Before, `init` rewrote `.vscode/settings.json`, `.zed/settings.json`, `tsconfig.json`, and `package.json` with two-space indentation, which removed every comment and changed tab or four-space indentation. Now `init` edits only the values that it changes. Comments, trailing commas, indentation, line endings, and key order stay as they are, and new keys go at the end of their object.

- [#512](https://github.com/adelrodriguez/adamantite/pull/512) [`25fa5e3`](https://github.com/adelrodriguez/adamantite/commit/25fa5e3bffa47df50b293d5321adcca0b106639a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fix `npm install adamantite`, which hung. `@effect/platform-node` accepts any `@effect/platform-node-shared@^4.0.0`, and each `@effect/platform-node-shared` release requires the matching `effect` version, which differs from the `effect@4.0.0` that Adamantite pins. Since `@effect/platform-node-shared@4.0.3`, which requires the unpublished `effect@4.0.3`, npm repeated the resolution forever. Adamantite now pins `@effect/platform-node-shared@4.0.0`, aligned with `effect` and `@effect/platform-node`.

- [#506](https://github.com/adelrodriguez/adamantite/pull/506) [`2fd190f`](https://github.com/adelrodriguez/adamantite/commit/2fd190f2ac6a8b148a99d0e639928884e40a1eca) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Pin `pnpm/action-setup@v6` in the GitHub Actions workflow that `adamantite init` creates for pnpm projects. Before, the workflow pinned `@v4`, two major versions behind the version that Adamantite's own CI uses. Run `adamantite init` again, or change the version in `.github/workflows/adamantite.yml` by hand, to update an existing workflow.

- [#498](https://github.com/adelrodriguez/adamantite/pull/498) [`2190a1b`](https://github.com/adelrodriguez/adamantite/commit/2190a1bb7ad1318d997d67435a66b15ee121ce26) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Turn off four rules in the `vitest` lint preset and one in the `jest` lint preset that contradict another rule in the same preset. Before, code that one rule required was reported by the other rule.

  - `vitest`: keep `prefer-importing-vitest-globals` and turn off `no-importing-vitest-globals`.
  - `vitest`: keep `prefer-called-once` and turn off `prefer-called-times`.
  - `vitest`: keep `valid-title` and turn off `prefer-describe-function-title`.
  - `vitest` and `jest`: keep `require-hook` and turn off `no-hooks`. Setup code can now go in `beforeAll` and `beforeEach`, and `prefer-hooks-on-top`, `prefer-hooks-in-order`, and `no-duplicate-hooks` now apply.

- [#501](https://github.com/adelrodriguez/adamantite/pull/501) [`760642c`](https://github.com/adelrodriguez/adamantite/commit/760642cc9b3898b7df0665657d1ad053659bdab2) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop two rules in the `vitest` and `jest` lint presets from reporting correct tests.

  - `vitest`: `no-standalone-expect` now accepts `expect` in the test functions of `@effect/vitest`: `it.effect`, `it.live`, and `it.prop`, with their `each`, `fails`, `only`, `prop`, `runIf`, `skip`, and `skipIf` forms. Before, the rule reported every `expect` in an `it.effect` test.
  - `vitest` and `jest`: `prefer-expect-assertions` now reports only `async` tests and tests that call `expect` in a callback or a loop, where an `expect` can fail to run. Before, the rule required `expect.assertions()` or `expect.hasAssertions()` in every test, also in synchronous tests where every `expect` always runs.

## 0.43.0

### Minor Changes

- [#490](https://github.com/adelrodriguez/adamantite/pull/490) [`47a2c98`](https://github.com/adelrodriguez/adamantite/commit/47a2c987f683072fa7411f9c961cf832e0495129) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add custom rules: write project-specific Oxlint rules in `.adamantite/rules/`, one rule for each file, and enable them with `custom()` from the new `adamantite/lint/custom` export. A file `no-process-env.ts` becomes the rule `project/no-process-env`, and files that start with `_` are helpers. A relative `dir` resolves from the file that calls `custom()`, so a monorepo can keep its rules in a shared tooling package, and the `name` option gives each rules folder its own plugin name. The new `adamantite/rules` export provides `defineRule` and the rule and AST types, so a rule file needs no other dependency; `@oxlint/plugins` is now a runtime dependency for this reason. `adamantite init` adds `custom()` to the generated `oxlint.config.ts`, where it is an empty config until the project adds a rule, and the AGENTS.md guidance mentions custom rules. The new `adamantite rule add <name>` command writes a rule stub and the authoring guidance, with `--dir` for another rules folder, and `adamantite rule ast <file>` prints the AST that rules visit. Doctor reports a rule file that cannot load, with the reason, a rules folder that no `custom()` call loads, and two rules folders that share a plugin name. The skill has a new "Custom rules" section.

- [#486](https://github.com/adelrodriguez/adamantite/pull/486) [`2c3fcd1`](https://github.com/adelrodriguez/adamantite/commit/2c3fcd1549127b1534aa6f9a226dbe86ca60516a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `effect` lint preset with curated [@effect/tsgo](https://github.com/Effect-TS/tsgo) rules for Effect misuse, such as effects that never run and unhandled errors. `@effect/tsgo` is a managed plugin. Its rules exist only in Oxlint binaries that `effect-tsgo patch --oxlint --typescript` patched, so `adamantite init` installs the pinned package, runs the patch, sets the `prepare` script to the new `adamantite prepare` command, and adds the `@effect/language-service` entry with `diagnostics: false` to `tsconfig.json`. `adamantite prepare` runs the patch, and `adamantite update` runs it after it installs packages. Doctor reports a missing package, `prepare` step, or tsconfig entry. A production-only install that runs scripts fails at `adamantite prepare`, so use `--ignore-scripts` for those installs. The analyze preset exports `ignoreDependencies.effect`, which `init` sets and doctor requires while `oxlint.config.ts` imports the preset.

- [#489](https://github.com/adelrodriguez/adamantite/pull/489) [`7697b18`](https://github.com/adelrodriguez/adamantite/commit/7697b18c080fa2ceccbf8280c443457ee60f5652) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/lint/tanstack` preset for TanStack Query apps that preload queries in route loaders

  The preset enables two rules from Adamantite's own Oxlint plugin. `adamantite/query-from-loader` reports `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, and `useSuspenseInfiniteQuery` from `@tanstack/react-query` in route files, which call a route factory such as `createFileRoute` from `@tanstack/react-router`, when they take a plain options object or a `queryOptions()` call made inside a function, including through a local `const`. Define each query once with `queryOptions()` (`infiniteQueryOptions()` for the infinite hooks) at module scope or in an exported factory, preload it in the route loader, and pass the same options to the hook. Type-only wrappers, such as `as const` and `satisfies`, do not hide the options from the rule. An object that spreads shared options, such as `{ ...userQuery(id), select }`, stays allowed. The rule checks one file at a time, so it cannot prove that a loader preloads the options. `adamantite/no-query-data-in-state` reports `useState` calls whose initial value comes from query data, such as `useState(query.data)`, because the copy stops updating when the query refetches.

  Select the preset in `adamantite init` or with `--preset tanstack`. It needs no extra dependency.

- [#483](https://github.com/adelrodriguez/adamantite/pull/483) [`1a65f53`](https://github.com/adelrodriguez/adamantite/commit/1a65f53a4ec24c535d477dd1b7d04966ee293480) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update the managed tooling and report utility types that resolve to `{}`

  The core lint preset now enables `typescript/no-generated-empty-object-type`. This type-aware rule reports utility types and intersections that resolve to the empty object type `{}`, such as `Omit<{ a: string }, "a">`. It adds to `typescript/no-empty-object-type`, which reports only a `{}` that you write.

  Update the managed tooling versions: Oxlint 1.86.0, Oxfmt 0.71.0, oxlint-tsgolint 7.0.2003, Knip 6.39.0, and `@shadcn/lint` 0.2.0. Also update the runtime dependencies `@clack/prompts` 1.8.1, `nypm` 0.6.10, and `oxc-parser` 0.152.0.

  To upgrade an existing project:

  - Run `adamantite update` before you lint. Oxlint 1.83.0, which earlier Adamantite releases install, does not know the new rule and stops with `Rule 'no-generated-empty-object-type' not found in plugin 'typescript'`. `adamantite doctor` reports a version mismatch for older pins.
  - Expect `adamantite check` to fail on existing utility types that resolve to `{}`. Replace each one with the type that you intend, such as `Record<string, never>` for an object with no properties.

### Patch Changes

- [#491](https://github.com/adelrodriguez/adamantite/pull/491) [`3edd34a`](https://github.com/adelrodriguez/adamantite/commit/3edd34a91f4ecffffe740422ebd21d6d9b0da62d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Type `ignorePatterns` on the core lint preset as `string[]`, not `string[] | undefined`, so projects can spread `core.ignorePatterns` into their own patterns

## 0.42.0

### Minor Changes

- [#464](https://github.com/adelrodriguez/adamantite/pull/464) [`ffab2d6`](https://github.com/adelrodriguez/adamantite/commit/ffab2d6f5bc585e0b343cee88529ba52c495145a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add `--only lint` and `--only format` to `adamantite check` and `adamantite fix` to run only the Oxlint stage or only the Oxfmt stage. Arguments after `--` go to the selected stage, and to Oxlint when both run.

- [#479](https://github.com/adelrodriguez/adamantite/pull/479) [`b0bbf60`](https://github.com/adelrodriguez/adamantite/commit/b0bbf600b2809ab1faacc8298b9a5c2d000019ea) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/lint/strict` preset for framework-neutral opinions

  The preset enables `adamantite/no-overzealous-destructuring`. The rule reports destructuring patterns nested more than 2 levels deep, such as `const { data: { user: { name } } } = query`, and object patterns that take more than 5 properties. A rest element does not count as a property. It checks declarations, parameters, assignments, `for...of` heads, and `catch` clauses. Each message tells what to do instead: keep the object and read its members, or split the pattern. Set the rule's `maxDepth` and `maxProperties` options to change the limits.

  The preset also sets `typescript/consistent-type-assertions` to ban type assertions. `as const` stays allowed, and test files keep the core preset's setting.

  Select the preset in `adamantite init` or with `--preset strict`. It uses Adamantite's own Oxlint plugin, so it needs no extra dependency.

- [#480](https://github.com/adelrodriguez/adamantite/pull/480) [`466b75e`](https://github.com/adelrodriguez/adamantite/commit/466b75ed5660d0c06da0624a5b7f4784be60f790) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/lint/react-doctor` preset for React state and effect misuse

  The preset enables 12 curated rules from [React Doctor](https://github.com/millionco/react-doctor) at `error`. They report state changed in place, impure state updaters, stores created during render, effects that do the work of an event handler or exist only to react to trigger state, data fetched in an effect, state set after an `await` in an effect, live state pushed to a parent, and observers or animation frame loops that an effect does not clean up. The preset leaves out rules that the native `react`, `react-hooks`, `jsx-a11y`, and `unicorn` rules already report, and the TanStack Query and TanStack Start rules.

  Use the preset together with the `react` preset. It adds to `react-strict` and does not replace it.

  `oxlint-plugin-react-doctor` is a managed plugin. Select the preset in `adamantite init` or with `--preset react --preset react-doctor`, and `init` installs the pinned version. `adamantite doctor` reports a missing or outdated package, and `adamantite update` moves it with the other managed dependencies. If you add the preset to `oxlint.config.ts` by hand, install `oxlint-plugin-react-doctor` too.

  The plugin has a modified MIT license. Using it as machine learning training data, or selling it as a hosted product, needs written permission from the copyright holder.

- [#478](https://github.com/adelrodriguez/adamantite/pull/478) [`1b03cd7`](https://github.com/adelrodriguez/adamantite/commit/1b03cd77b52c7f753c62a2e69e9926fcfe3b29ca) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/lint/react-strict` preset for React feature code

  The preset enables `adamantite/no-react-state-hooks`, the first rule of Adamantite's own Oxlint plugin. The rule reports `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useMemo`, and `useCallback` from `react`, including aliased imports and `React.useState(...)` calls. Each message tells what to do instead. Hooks stay allowed in hook modules that match `**/use[A-Z]*.{ts,tsx}`, `**/use-*.{ts,tsx}`, or `**/hooks/**`, such as `useCart.ts` and `use-cart.ts`. Set the rule's `allow` option for another layout, and its `hooks` option to change the reported hooks.

  Select the preset in `adamantite init` or with `--preset react-strict`. The plugin ships inside the package, so the preset needs no extra dependency.

- [#467](https://github.com/adelrodriguez/adamantite/pull/467) [`e747b74`](https://github.com/adelrodriguez/adamantite/commit/e747b74223d957ceb69e842526abdb20370d04eb) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `adamantite/lint/shadcn` preset for Tailwind v4 design systems

  The preset enables the six [@shadcn/lint](https://github.com/shadcn-ui/lint) rules at `error`: `shadcn/no-restyle`, `shadcn/no-raw-colors`, `shadcn/no-arbitrary-values`, `shadcn/no-inline-styles`, `shadcn/no-unknown-classes`, and `shadcn/require-static-classes`. Layout classes such as `mt-4` and `w-[320px]` are allowed, and the component-owned rules are off under `**/components/ui/**`. shadcn/ui is not required.

  `@shadcn/lint` is a managed plugin. Select the preset in `adamantite init` or with `--preset shadcn`, and `init` installs the pinned version. `adamantite doctor` reports a missing or outdated package, and `adamantite update` moves it with the other managed dependencies. If you add the preset to `oxlint.config.ts` by hand, install `@shadcn/lint` too.

  The plugin finds components and the theme through `components.json`. Without that file it looks for components in `components/ui` or `src/components/ui` and discovers the stylesheet that imports Tailwind. Set `settings.shadcn.ui` in the Oxlint config when components live elsewhere.

  Also updates `oxc-parser` to 0.150.0.

- [#458](https://github.com/adelrodriguez/adamantite/pull/458) [`086adcf`](https://github.com/adelrodriguez/adamantite/commit/086adcff95f10c18efb677efa9204eca67b2526d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the deprecated `adamantite format` and `adamantite monorepo` commands.

  Update package scripts, CI workflows, and agent instructions to use these replacements:

  - Replace `adamantite format --check` with `adamantite check`.
  - Replace `adamantite format` with `adamantite fix`.
  - Replace `adamantite monorepo` with `adamantite analyze --only monorepo`.
  - Replace `adamantite monorepo --fix` with `adamantite analyze --only monorepo --fix`.

  `check` and `fix` also run Oxlint. To run only the formatter, use `adamantite check --only format` or `adamantite fix --only format`.

  `init --script` now accepts only `check`, `fix`, and `analyze`. Run `adamantite doctor` to find retired scripts and workflow steps that still need updates.

### Patch Changes

- [#465](https://github.com/adelrodriguez/adamantite/pull/465) [`d636f37`](https://github.com/adelrodriguez/adamantite/commit/d636f37f7a6ccfcca28d72de869bc505a6afd3ae) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the Git working tree check from the `adamantite doctor` agent handoff. Doctor no longer warns or asks for confirmation before starting an agent on a dirty tree, and the repair prompt no longer tells the agent to check for a clean tree.

- [#481](https://github.com/adelrodriguez/adamantite/pull/481) [`ec80dac`](https://github.com/adelrodriguez/adamantite/commit/ec80dac2058c01958e984ed2cf9171d69080585c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Effect, `@effect/platform-node`, and `@effect/vitest` to the stable 4.0.0 release. Before this change, fresh installs resolved `@effect/platform-node-shared` to rc.118 next to `effect` rc.115, and the CLI crashed at start with `fiber.succeedWith is not a function`. Now all Effect packages resolve to one 4.0.0 runtime.

- [#463](https://github.com/adelrodriguez/adamantite/pull/463) [`8974fa9`](https://github.com/adelrodriguez/adamantite/commit/8974fa9dfe776a97bc195df00546094e20f233fe) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Seed the `adamantite doctor` agent handoff with the combined Markdown repair prompt. The agent now starts with every finding instead of a one-line instruction to run Doctor itself.

## 0.41.0

### Minor Changes

- [#456](https://github.com/adelrodriguez/adamantite/pull/456) [`d23e4f3`](https://github.com/adelrodriguez/adamantite/commit/d23e4f37cad26967e35e17406dc24dde43afc9f1) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fold formatting into `check`/`fix` and Sherif into `analyze`, and deprecate the standalone `format` and `monorepo` commands.

  - **`check` and `fix` run Oxfmt.** Both commands now format and lint, and run both tools even when the first one fails. Forwarded arguments still apply only to Oxlint.
  - **`analyze` runs Sherif before Knip in a detected monorepo**, so `analyze` fails on Sherif findings there. Outside a monorepo it behaves as before. Monorepo projects: run `adamantite update` to install Sherif; when it is missing, `analyze` fails and points to `adamantite update`.
  - **New `analyze --only monorepo | unused` flag** runs a single stage. Without `--fix`, both stages run and the exit code comes from the first failure; with `--fix`, a Sherif failure skips Knip. `--strict` applies to Knip only, and arguments after `--` go to Knip, or to the stage `--only` selects. `--only monorepo` fails outside a monorepo and with `--strict`. Sherif refuses to fix in CI, so in a monorepo `analyze --fix` fails when `CI` is set; use `analyze --only unused --fix` there.
  - **New `ignoreDependencies` export from `adamantite/analyze`.** Knip cannot see that `analyze` runs Sherif and reports `sherif` as unused. In a detected monorepo, `init` now writes `ignoreDependencies: ignoreDependencies.monorepo` to the generated `knip.config.ts`. Existing monorepo projects: add that import and line to your `knip.config.ts`. The default export does not change.
  - **`adamantite format` and `adamantite monorepo` are deprecated.** Both still run, print a deprecation warning, and will be removed in the next release. Use `check`/`fix` instead of `format`, and `analyze` (or `analyze --only monorepo --fix`) instead of `monorepo`. `analyze` runs Sherif without flags, so move custom Sherif flags into the `sherif` field of the root `package.json`.
  - **Breaking: `init` no longer offers the `format`, `check:monorepo`, or `fix:monorepo` scripts**, and generated CI workflows and `AGENTS.md` guidance no longer include them. Passing `--script format`, `--script check:monorepo`, or `--script fix:monorepo` now fails; select `check`/`fix` or `analyze` instead. Selecting `check` or `fix` installs and configures Oxfmt, and selecting `analyze` in a monorepo installs Sherif. A legacy `format` script alone no longer enables Oxfmt management.
  - **Doctor guides the migration.** It reports missing Oxfmt or Sherif packages and configuration, a monorepo `knip.config.ts` without the `sherif` ignore, leftover `format`, `check:monorepo`, and `fix:monorepo` scripts (or any script starting with `adamantite monorepo`), and GitHub Actions steps that still run them. Doctor does not assess `AGENTS.md`; remove the `format` line from its Adamantite section yourself.
  - **Cleaner command output.** `check`, `fix`, and `analyze` print a heading before each tool runs (for example `✨ Checking formatting · adamantite (oxfmt)`), spawned tools no longer print Node's `MODULE_TYPELESS_PACKAGE_JSON` warning, and the ASCII banner now only prints during `init`.

### Patch Changes

- [#457](https://github.com/adelrodriguez/adamantite/pull/457) [`a974a7b`](https://github.com/adelrodriguez/adamantite/commit/a974a7b8b1ebb6f3bd24169643207214f35127f1) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - In an npm workspaces monorepo, `adamantite init` now installs the managed devDependencies into the root `package.json` only. Before, npm installed them into every workspace package, and `adamantite analyze` then failed. `adamantite update` now also installs at the workspace root in pnpm and Yarn 1 monorepos, where the package manager refuses a root install without the workspace root flag.

## 0.40.0

### Minor Changes

- [#410](https://github.com/adelrodriguez/adamantite/pull/410) [`489b0a8`](https://github.com/adelrodriguez/adamantite/commit/489b0a89bff12bb0429e632c70e85577ae9d873d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the `doctor --fix` compatibility stub. `adamantite doctor --fix` now fails as an unknown option. Run `adamantite doctor` and follow the reported goal criteria.

### Patch Changes

- [#412](https://github.com/adelrodriguez/adamantite/pull/412) [`26bba66`](https://github.com/adelrodriguez/adamantite/commit/26bba66edd08928c3af9b61632151258a6273680) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update the managed `oxlint` version to 1.83.0. Run `adamantite update` to pick it up; no config change is necessary. Includes React 19.3 support in `react/jsx-no-useless-fragment` and `react/no-unknown-property`.

## 0.39.0

### Minor Changes

- [#398](https://github.com/adelrodriguez/adamantite/pull/398) [`ee97933`](https://github.com/adelrodriguez/adamantite/commit/ee97933d7d9f642cb68f97993dd5c2a91a7362a9) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update the vendored anti-slop plugin to upstream v0.1.2 (`e8c4880`)

  The bundled build moves from `446268e` to `e8c4880`, picking up the v0.1.1 and v0.1.2 releases. The rule set is unchanged, so no preset configuration changes are needed. **Some rules are stricter than before, so source that passed `adamantite check` on 0.38.0 can start reporting `anti-slop` errors after this update.** The tightenings:

  - `no-unknown-parameters` and `no-unknown-type-aliases` now also report union types that contain `unknown`, such as `input: string | unknown` or `type T = string | unknown`.
  - `no-object-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`, and `no-known-value-widening` now resolve block-scoped, forward-referenced, and transparent generic type aliases, so an alias declared inside a function body is no longer overlooked.
  - `no-known-value-widening` also flags known values passed into local `unknown` type predicates.

  The relaxations, where previously reported code is now accepted:

  - `no-runtime-typeof` now allows every `typeof x === "undefined"` comparison, not only existence probes such as `typeof document === "undefined"`. Comparisons against any other type string are still reported.
  - `no-unknown-parameters` allows `unknown` on the exact subject of a type predicate.
  - `no-known-value-widening` no longer flags finite-key `Record` targets such as `Record<"a" | "b", T>`.
  - `no-shape-in-symbol-names` allows static member reads such as Zod's `schema.shape`.
  - `no-unsafe-dictionary-type` allows generic constraints such as `T extends Record<string, unknown>`.
  - `require-safety-comment-for-type-assertion` recognizes comments above exported declarations and accepts a `markers` option for alternative prefixes.

  Upstream also added a separate opt-in `anti-slop-effect` plugin with one rule, `no-service-constructor-imports`. It is not vendored here because it lives behind its own entry point and encodes Effect service-layer architecture policy rather than generic lint rules.

### Patch Changes

- [#409](https://github.com/adelrodriguez/adamantite/pull/409) [`d476141`](https://github.com/adelrodriguez/adamantite/commit/d4761411e4d35a21eee345a0126a49141922c485) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Effect packages to 4.0.0-rc.115 to align runtime dependencies in fresh package installs.

## 0.38.0

### Minor Changes

- [#397](https://github.com/adelrodriguez/adamantite/pull/397) [`8381104`](https://github.com/adelrodriguez/adamantite/commit/8381104aea6a2e6d2dfbc1a434dbb299ad9ac331) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Let interactive `adamantite doctor` hand findings off to an installed coding agent:
  Claude Code, Codex, Cursor, Gemini CLI, Grok Build, or OpenCode. Doctor detects
  installed agents by probing each CLI and only offers the ones on `PATH`, then starts the
  selected agent in the terminal with a one-line seed prompt that tells the agent to run
  Doctor itself, so the agent's own UI owns permissions, trust, and authentication and no
  findings content appears in process arguments. Doctor warns before handing off a working
  tree that is not known to be clean, reassesses once after the agent session ends, and
  exits 0 only when no findings remain — the agent's exit code is ignored. The agent runs
  in Doctor's process group and Doctor ignores Ctrl-C while the agent owns the terminal,
  so terminal signals reach only the agent. When an agent fails to start, the Markdown
  prompt copy remains available. Non-interactive output is unchanged.

- [#396](https://github.com/adelrodriguez/adamantite/pull/396) [`5428bdd`](https://github.com/adelrodriguez/adamantite/commit/5428bddf3228319e5be42ca5a5fd7f2b03bdf423) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Format binary and ternary operators at the start of continuation lines

  The format preset now sets `experimentalOperatorPosition: "start"`, so multiline conditions place `&&`, `||`, `??`, and ternary operators at the beginning of the wrapped line instead of the end. The managed oxfmt version moves to 0.65.0, which supports the option. Expect a one-time reformat of multiline expressions the next time you run `format`.

- [#393](https://github.com/adelrodriguez/adamantite/pull/393) [`af18c34`](https://github.com/adelrodriguez/adamantite/commit/af18c346d0e7a2efa35d511d2850bb50282831ce) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Make `adamantite doctor` emit verifiable repair findings and prompts instead of mutating projects. Interactive runs show formatted findings and offer to copy one Markdown prompt. Non-interactive runs print Markdown directly so a calling agent can follow it, including assessment warnings that explain why a finding is absent. Warning-only runs still exit 0. `update` now only updates managed dependencies. Keep `doctor --fix` as a one-release error stub, remove the deprecated `typecheck` alias, and require `pnpm-workspace.yaml` to define packages before treating a project as a monorepo.

  Align the pinned Effect packages on `4.0.0-rc.112` so the published CLI installs one compatible runtime.

### Patch Changes

- [#386](https://github.com/adelrodriguez/adamantite/pull/386) [`e78de64`](https://github.com/adelrodriguez/adamantite/commit/e78de6400b9494a10f677c180b2f0037adbb50dc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fix `serializeTsObjectLiteral` corrupting keys that contain a double quote and dropping own `__proto__` keys

  The key-unquoting regex matched escaped quotes inside serialized keys, so migrating a knip or oxfmt config with a quote-containing key produced a `*.config.ts` file with invalid syntax. It also unquoted `__proto__`, which an object literal treats as prototype assignment; the migration path never hits this because `parseJson` strips `__proto__`, but any direct caller would lose the key. Quote-containing keys now stay quoted, and `__proto__` keys are emitted as computed properties (`["__proto__"]:`) so they survive as own properties.

- [#395](https://github.com/adelrodriguez/adamantite/pull/395) [`62cd29a`](https://github.com/adelrodriguez/adamantite/commit/62cd29a12ca3ce4ad48b012d00053934d42c8f03) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Emit `oxlint.config.ts` with sorted keys so a fresh `adamantite check` passes

  The core preset enables `sort-keys`, but `adamantite init` generated the config with its keys in `options`, `ignorePatterns`, `extends` order, so running the managed `check` script in a freshly initialized project immediately failed on the file init had just written. The generator now sorts the top-level keys and the keys inside `options` in the order the rule expects. Caught by the new `test:smoke` script, which runs the built CLI's `init` against a real fixture project and then executes the real oxlint, oxfmt, and knip binaries on the result.

- [#386](https://github.com/adelrodriguez/adamantite/pull/386) [`e78de64`](https://github.com/adelrodriguez/adamantite/commit/e78de6400b9494a10f677c180b2f0037adbb50dc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Fix knip and oxfmt migrations writing non-identifier config keys as bare identifiers

  The config writers interpolated keys directly into the generated `*.config.ts`, so a legal knip key such as `lint-staged` or a rule name containing punctuation produced invalid TypeScript. Keys are now emitted through `serializeTsPropertyKey`, which quotes non-identifier keys and writes `__proto__` as a computed property.

## 0.37.0

### Minor Changes

- [#382](https://github.com/adelrodriguez/adamantite/pull/382) [`a70fd83`](https://github.com/adelrodriguez/adamantite/commit/a70fd83d0209ed4c1acba108a5c5aa699066b9b2) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Adopt the React Compiler rules that replace `react/react-compiler` in oxlint 1.79.0

  oxlint 1.79.0 removed the nursery `react/react-compiler` rule and split it into per-category React Compiler rules. The react preset now enables the correctness rules (`error-boundaries`, `globals`, `immutability`, `incompatible-library`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `use-memo`, `void-use-memo`), the suspicious rules (`capitalized-calls`, `hooks`, `memo-dependencies`), and the perf rule `no-deriving-state-in-effects` as errors. `exhaustive-effect-dependencies` stays off because it duplicates the diagnostics `react/exhaustive-deps` already reports, and the restriction-category rules (`invariant`, `rule-suppression`, `syntax`, `todo`, `unsupported-syntax`) stay off because they only apply to codebases running the React Compiler build.

  **Breaking behavior:** oxlint 1.79.0 fails to load any config that still references the removed rule — linting stays completely down until the reference is gone. Projects that only extend the Adamantite presets are covered by this release, but if your own `oxlint.config.ts` overrides `react/react-compiler` (for example to turn it off), delete that entry when you update. Managed projects install oxlint 1.79.0 on the next `adamantite update`.

- [#381](https://github.com/adelrodriguez/adamantite/pull/381) [`e60bfb5`](https://github.com/adelrodriguez/adamantite/commit/e60bfb52b1b22c9dae88383b11c08974b21f3051) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add Astro formatting to the Zed preset and migrate stale Zed oxfmt settings

  The Zed preset now formats `.astro` files through Zed's managed Prettier with `prettier-plugin-astro` (oxfmt cannot format Astro), mirroring Zed's shipped defaults, and explicitly disables Prettier for the languages oxfmt owns so the two formatters never compete. A new migration removes settings the old Zed preset wrote under the oxfmt language server that the formatter never reads (`configPath`, `typeAware`, `unusedDisableDirectives`, and the deprecated `fmt.experimental`); only exact value matches are removed, so user-edited values survive.

## 0.36.0

### Minor Changes

- [#372](https://github.com/adelrodriguez/adamantite/pull/372) [`02f9064`](https://github.com/adelrodriguez/adamantite/commit/02f906448448ba544e8518d3ab06946b9e623c5d) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add the `antislop` lint preset, a vendored build of [anti-slop](https://github.com/dmmulroy/anti-slop) that rejects low-evidence, low-signal TypeScript and JavaScript patterns. Extend `adamantite/lint/antislop` alongside the core preset, or select it during `adamantite init`; nothing extra needs to be installed. Note that the preset also turns off two core rules that conflict with the anti-slop rules: `typescript/consistent-indexed-object-style` (its autofix produces code that `anti-slop/no-known-value-widening` re-flags) and `unicorn/no-immediate-mutation`. The init preset prompt now also shows a one-line description for every preset.

- [#373](https://github.com/adelrodriguez/adamantite/pull/373) [`79fea78`](https://github.com/adelrodriguez/adamantite/commit/79fea78a8df66bb42960153b863bbb11406563c5) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add canonical `ignorePatterns` (dependencies, build output, generated code) to the core lint preset, exported both on the preset and as a named export. Oxlint does not merge `ignorePatterns` from extended configs, so generated `oxlint.config.ts` files now hoist `core.ignorePatterns` onto the root config, appending any project-specific patterns carried over from a legacy config.

### Patch Changes

- [#379](https://github.com/adelrodriguez/adamantite/pull/379) [`2e3262b`](https://github.com/adelrodriguez/adamantite/commit/2e3262bfaa25661c1ec33471e123f6158fa7f019) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Surface GitHub Actions setup failures during `adamantite init` instead of silently continuing. When the workflow cannot be written, `init` now warns with the underlying reason and a recovery hint. `doctor` and `update` also assess integrations concurrently and read `package.json` once per assessment pass instead of once per integration.

- [#378](https://github.com/adelrodriguez/adamantite/pull/378) [`ed71957`](https://github.com/adelrodriguez/adamantite/commit/ed7195787ca68f80f8984a83f9b83851141f94cd) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop shipping the raw `presets/*.ts` sources in the npm package. The published tarball now contains only the compiled `dist/presets` output that the package exports already point to, which removes duplicate files and shrinks the unpacked size from 311 kB to 196 kB.

## 0.35.0

### Minor Changes

- [#360](https://github.com/adelrodriguez/adamantite/pull/360) [`8782acf`](https://github.com/adelrodriguez/adamantite/commit/8782acf3d4001190b8e155a744d79a7933aa56c2) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Support Bun 1.0 and Node.js 22.19 or later while using current runtimes for development.

  Generated GitHub Actions workflows now follow the target project's Node.js version declaration (`.node-version`, `.nvmrc`, `.tool-versions`, or `package.json`) through `node-version-file`, and fall back to `node-version: "lts/*"` when no declaration exists. `adamantite update` migrates existing managed workflows away from a hard-coded Node.js version.

- [#361](https://github.com/adelrodriguez/adamantite/pull/361) [`04f5494`](https://github.com/adelrodriguez/adamantite/commit/04f5494942f3752df107630520ab9131486f04db) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Skip root `tsconfig.json` creation and updates during `init` in a detected monorepo. A catch-all root config makes TypeScript treat all workspace packages as one project and can try to emit over JavaScript input files. In a monorepo, `init --typescript` now prints guidance to add `"extends": "adamantite/typescript"` to each package's `tsconfig.json` or to a shared base config, and does not change any files.

  Stop overwriting an existing `extends` value when `init` updates a `tsconfig.json`. Adamantite now appends `"adamantite/typescript"` to the `extends` array instead, so a shared base config such as `"@company/tsconfig"` stays in place. The preset is appended last, so its compiler options override the earlier entries.

  The `adamantite/typescript` preset now sets `"noEmit": true`, so projects that extend it type-check without emitting output. If your project emits output with `tsc` through the preset, set `"noEmit": false` in your own `tsconfig.json`.

### Patch Changes

- [#370](https://github.com/adelrodriguez/adamantite/pull/370) [`dfb307b`](https://github.com/adelrodriguez/adamantite/commit/dfb307b467a6d17a063d357fb48aa7773a04a178) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Stop `init` from silently overwriting existing package scripts. Scripts whose commands differ from Adamantite's managed commands are now kept and reported: the interactive initializer asks once before overwriting, and non-interactive runs preserve them unless the new `--overwrite-scripts` flag is passed. Preserved scripts are omitted from AGENTS.md guidance.

- [#369](https://github.com/adelrodriguez/adamantite/pull/369) [`943a1a9`](https://github.com/adelrodriguez/adamantite/commit/943a1a979d308aa751ff0b531686a9d7ad66f20f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Skip root `tsconfig.json` creation and updates in the `legacy-typecheck-script` migration when a monorepo is detected. The migration, reachable through `adamantite update` and `adamantite doctor --fix`, previously wrote back the catch-all root config that `init` stopped writing in monorepos. It now prints the same guidance as `init` — add `"extends": "adamantite/typescript"` to each package's `tsconfig.json` or to a shared base config — and its validation no longer reports a failure for the deliberately absent file.

- [#363](https://github.com/adelrodriguez/adamantite/pull/363) [`6270f58`](https://github.com/adelrodriguez/adamantite/commit/6270f5816498263f882dea91289d25d6a68d569e) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Show the captured package manager output when dependency installation fails during `init`. The error message now includes the underlying diagnostic, for example `ERR_PNPM_UNSUPPORTED_ENGINE`, instead of only the package list.

- [#363](https://github.com/adelrodriguez/adamantite/pull/363) [`6270f58`](https://github.com/adelrodriguez/adamantite/commit/6270f5816498263f882dea91289d25d6a68d569e) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Include the underlying cause in file-system and extension error messages. Failed read, write, delete, and directory-creation operations now show the platform error detail, and a failed VS Code extension install reports the `code` CLI exit code.

## 0.34.4

### Patch Changes

- [#355](https://github.com/adelrodriguez/adamantite/pull/355) [`cdc9716`](https://github.com/adelrodriguez/adamantite/commit/cdc9716d5955b576179f947261c558db1727c099) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove the default file exclusions from the analysis preset. The preset no longer sets `ignore: ["**/*.d.ts"]` or `ignoreFiles: ["**/dist/**", "**/build/**", "**/coverage/**", "**/.next/**", "**/.vercel/**", "**/.turbo/**"]`, so each project now declares the exclusions that match its own structure. Knip already honors `.gitignore`, so the build-output globs were mostly redundant; the change that can surface new `files` errors is the loss of `**/*.d.ts`, which affects projects with committed declaration files such as `vite-env.d.ts`. To keep the previous behavior, add the keys back in your own `knip.config.ts` after the `...analyze` spread.

## 0.34.3

### Patch Changes

- [#352](https://github.com/adelrodriguez/adamantite/pull/352) [`9e45aa1`](https://github.com/adelrodriguez/adamantite/commit/9e45aa179cce677ccf14e81451a17b30d1eb214c) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Derive tooling config state, legacy-config warnings, and migration checks from a single detection pass so `init`, `doctor`, and `update` report consistent messages, run `update` migrations from migration checks directly, and point `adamantite init` users to `adamantite doctor --fix` when a legacy config is preserved.

- [#354](https://github.com/adelrodriguez/adamantite/pull/354) [`49dee7a`](https://github.com/adelrodriguez/adamantite/commit/49dee7af416bb8a92a6e3fdd9bc235efb59defc6) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Effect and its Node.js platform packages to 4.0.0-rc.108. Also update Changesets, Esrap, Knip, Oxc Parser, Oxfmt, and Oxlint to their latest configured versions.

## 0.34.2

### Patch Changes

- [#344](https://github.com/adelrodriguez/adamantite/pull/344) [`69d8dde`](https://github.com/adelrodriguez/adamantite/commit/69d8dde5c234f386d991e1ff9cabda9863682543) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Restructure and update the product documentation for the current CLI, presets, setup lifecycle, and supported runtime requirements.

- [#344](https://github.com/adelrodriguez/adamantite/pull/344) [`69d8dde`](https://github.com/adelrodriguez/adamantite/commit/69d8dde5c234f386d991e1ff9cabda9863682543) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Keep generated GitHub Actions workflows aligned with the repository's current action versions and make repeated Zed editor setup idempotent.

## 0.34.1

### Patch Changes

- [#342](https://github.com/adelrodriguez/adamantite/pull/342) [`b305053`](https://github.com/adelrodriguez/adamantite/commit/b3050538525d51f9c72e60beed5f72bc5390e1bd) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ship an `adamantite` agent skill (`skills/adamantite/SKILL.md`) in the npm package. The skill teaches coding agents how to initialize, check, repair, and update Adamantite in a project, and is discoverable through TanStack Intent (`intent list` / `intent load`).

## 0.34.0

### Minor Changes

- [#330](https://github.com/adelrodriguez/adamantite/pull/330) [`7da419f`](https://github.com/adelrodriguez/adamantite/commit/7da419f20b939b74ff62ae027961049f32fb8086) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Allow commands that wrap Knip, Oxlint, Oxfmt, or Sherif to forward arguments after `--`.

- [#337](https://github.com/adelrodriguez/adamantite/pull/337) [`0c182ef`](https://github.com/adelrodriguez/adamantite/commit/0c182ef7df49b2fa4db60d281c0c410b338924ef) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add a non-interactive `adamantite init` mode so agents and scripts can configure projects entirely through validated CLI flags.

### Patch Changes

- [#339](https://github.com/adelrodriguez/adamantite/pull/339) [`65d738b`](https://github.com/adelrodriguez/adamantite/commit/65d738ba12163ff28e8ca360a3e1f522b3adef57) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Ensure CLI progress spinners stop when setup, updates, or migrations fail or are interrupted.

## 0.33.2

### Patch Changes

- [#324](https://github.com/adelrodriguez/adamantite/pull/324) [`8f7da4b`](https://github.com/adelrodriguez/adamantite/commit/8f7da4bbaee8a7e14af2bfaba9a1fd28591b9805) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove `react-perf/jsx-no-jsx-as-prop` from the React lint preset to allow common composition and slot patterns.

## 0.33.1

### Patch Changes

- [#322](https://github.com/adelrodriguez/adamantite/pull/322) [`262452e`](https://github.com/adelrodriguez/adamantite/commit/262452e66111a92d32a34a83d5fff529be021e99) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Remove several overly strict performance and style rules from the React lint preset, including the rules that reject newly created prop values, enforce handler naming, and prohibit class component state.

## 0.33.0

### Minor Changes

- [#320](https://github.com/adelrodriguez/adamantite/pull/320) [`10ba5dc`](https://github.com/adelrodriguez/adamantite/commit/10ba5dc184140fef11bbbb718f02175bd37effbc) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Enable five new Oxlint rules across the core, React, and Vitest presets: `no-unreachable-loop`, `unicorn/explicit-timer-delay`, `unicorn/no-confusing-array-with`, `react/function-component-definition`, and `vitest/padding-around-test-blocks`. The existing `no-constant-binary-expression` rule also gains Oxlint's new relational-comparison diagnostics.

- [#321](https://github.com/adelrodriguez/adamantite/pull/321) [`bed194e`](https://github.com/adelrodriguez/adamantite/commit/bed194ecfa9a7435a57b809b0d57bd9d27cfb08f) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Require Node.js 24 or later to run the CLI.

- [#319](https://github.com/adelrodriguez/adamantite/pull/319) [`6f1fd10`](https://github.com/adelrodriguez/adamantite/commit/6f1fd10332ae5b9b4db94059dec2d4930a972cef) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Upgrade consumer type-aware linting to TypeScript 7.0.2 semantics, including hard errors for TypeScript 6 deprecations and TypeScript 7 compiler defaults. Ambient `@types/*` packages are no longer discovered automatically and must be listed explicitly when needed. Require TypeScript `>=7` as a peer dependency, replace the native preview with `typescript@7.0.2`, and update Oxlint to 1.75.0, oxlint-tsgolint to 7.0.2001, and Oxfmt to 0.60.0.

### Patch Changes

- [#292](https://github.com/adelrodriguez/adamantite/pull/292) [`d1bd939`](https://github.com/adelrodriguez/adamantite/commit/d1bd9390f24e371a41d00b00c3667aa41180403a) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update dependency versions for prompts and development tooling.

- [#308](https://github.com/adelrodriguez/adamantite/pull/308) [`b4bcd6c`](https://github.com/adelrodriguez/adamantite/commit/b4bcd6c946683066b3248362b996264635bb5c41) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Add optional `AGENTS.md` guidance during `adamantite init` with idempotent Adamantite marker updates.

## 0.32.3

### Patch Changes

- [#290](https://github.com/adelrodriguez/adamantite/pull/290) [`b7a6b86`](https://github.com/adelrodriguez/adamantite/commit/b7a6b86e4eb0255cfe344c8048d8dc1e306fe214) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Extend the lint presets with newly supported Oxlint rules: `react/react-compiler`, `unicorn/no-array-fill-with-reference-type`, `unicorn/prefer-export-from`, `unicorn/prefer-single-call`, `node/no-mixed-requires`, and the `vue/no-async-in-computed-properties`, `vue/no-dupe-keys`, `vue/no-side-effects-in-computed-properties`, and `vue/require-default-prop` rules. The deprecated `unicorn/prefer-string-starts-ends-with` rule has been removed.

- [#290](https://github.com/adelrodriguez/adamantite/pull/290) [`b7a6b86`](https://github.com/adelrodriguez/adamantite/commit/b7a6b86e4eb0255cfe344c8048d8dc1e306fe214) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Limit GitHub Actions workflow generation to the supported package managers (`bun`, `deno`, `npm`, `pnpm`, `yarn`). When another package manager is detected, Adamantite now skips workflow setup with a warning instead of emitting an unsupported workflow.

- [#290](https://github.com/adelrodriguez/adamantite/pull/290) [`b7a6b86`](https://github.com/adelrodriguez/adamantite/commit/b7a6b86e4eb0255cfe344c8048d8dc1e306fe214) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Update Effect and `@effect/platform-node` to `4.0.0-beta.92`.

- [#290](https://github.com/adelrodriguez/adamantite/pull/290) [`b7a6b86`](https://github.com/adelrodriguez/adamantite/commit/b7a6b86e4eb0255cfe344c8048d8dc1e306fe214) Thanks [@adelrodriguez](https://github.com/adelrodriguez)! - Derive the managed tooling versions from Adamantite's own `package.json` at build time instead of maintaining separate hardcoded constants, so the versions installed by `adamantite init` always match the pinned dependencies: Oxfmt (`0.57.0`), Oxlint (`1.72.0`), oxlint-tsgolint (`0.24.0`), Sherif (`1.12.0`), and Knip (`6.23.0`).

## 0.32.2

### Patch Changes

- [#282](https://github.com/adelrodriguez/adamantite/pull/282) [`87362fc`](https://github.com/adelrodriguez/adamantite/commit/87362fcafdbdb12fc9aa108eb5b95a18340d3fa9) Thanks [@wling-art](https://github.com/wling-art)! - Fix the React lint preset to use Oxlint's supported `jsx-a11y/anchor-ambiguous-text` rule.

## 0.32.1

### Patch Changes

- ed4c2ac: Fix preset declaration types so lint, format, and analyze presets can be extended without leaking readonly literal arrays into consumer configs.

## 0.32.0

### Minor Changes

- a5d54d9: Migrate format and Knip presets from JSON to TypeScript with full type safety

  Both `adamantite/format` and `adamantite/analyze` exports now resolve to typed TypeScript modules instead of JSON files. New projects get `oxfmt.config.ts` and `knip.config.ts` that import and spread the presets, making it easy to override individual options with autocomplete.

  **Breaking:** Existing JSON-based configs are now legacy formats:

  - `.oxfmtrc.json` / `.oxfmtrc.jsonc` → `oxfmt.config.ts`
  - `knip.json` / `knip.jsonc` → `knip.config.ts`

  Run `adamantite update` to migrate automatically. The migration preserves custom overrides and removes the old files.

### Patch Changes

- f22cdfd: Upgrade the bundled `oxfmt` version to `0.46.0` and enable the new JSDoc formatting option in the Adamantite formatter preset.

  Upgrade the bundled `oxlint` version to `1.61.0` and update `oxlint-tsgolint` to `0.21.1` to satisfy oxlint's peer dependency requirement.

  The lint presets now remove these rules:

  - Core: `comma-dangle`, which is no longer recognized by oxlint
  - Vitest: `vitest/prefer-to-be-truthy` and `vitest/prefer-to-be-falsy`, replaced by exact boolean assertions through `vitest/prefer-strict-boolean-matchers`

  The lint presets also enable these new rules added in recent oxlint releases:

  - Core: `no-useless-assignment`, `object-shorthand`, `unicorn/consistent-template-literal-escape`, `unicorn/custom-error-definition`, `unicorn/no-useless-iterator-to-array`, `unicorn/prefer-import-meta-properties`, and `unicorn/switch-case-break-position`
  - React: `react/hook-use-state` and `react/prefer-function-component`
  - Jest: `jest/padding-around-after-all-blocks`, `jest/prefer-ending-with-an-expect`, and `jest/valid-expect-in-promise`
  - Vitest: `vitest/prefer-called-exactly-once-with`, `vitest/prefer-strict-boolean-matchers`, `vitest/require-awaited-expect-poll`, and `vitest/require-mock-type-parameters`

  Upgrade the bundled `knip` version to `6.6.1`. This release range improves framework plugin coverage, config hints, workspace handling, and analysis performance.

  The analyze preset now explicitly reports unused catalog entries with `catalog: "error"` and unused namespace members with `namespaceMembers: "warn"`.

- cda39ae: Update the bundled Knip config for Knip v6 and refresh the bundled linting and formatting tool versions.

  Newly generated Knip configs now use the v6 schema URLs and drop the removed `classMembers` rule.

- 0ae2d85: Rename CI matrix entry from "lint" to "check" for consistency with the `adamantite check` command

## 0.31.0

### Minor Changes

- 4fcea21: `adamantite update` now runs a migration pipeline before dependency updates, so upgrades to the `adamantite check` workflow and related configuration can be checked, applied, validated, and rolled back safely when a migration fails.

  This release adds automatic update migrations for legacy Adamantite setups. `adamantite update` can now migrate `.oxlintrc.json` to `oxlint.config.ts`, patch managed `oxlint.config.ts` files so `adamantite check` and `adamantite fix` run with `options.typeAware` and `options.typeCheck` enabled, and replace the legacy `adamantite typecheck` script with the unified `adamantite check` command.

  When migrating the legacy `typecheck` script, Adamantite also bootstraps any missing `oxlint.config.ts` and `tsconfig.json` files, updates the GitHub Actions workflow when possible so it runs the new `check` command, and continues syncing managed tooling dependencies to the latest compatible Adamantite versions.

### Patch Changes

- 5881f82: Adamantite lint presets no longer ship built-in `ignorePatterns` defaults.

  Projects that still need ignores like `dist`, `.next`, or `node_modules` should define them in their local `oxlint.config.ts`.

## 0.30.2

### Patch Changes

- fa763e4: Update `@clack/prompts` to 1.1.0
- fa763e4: Fix package exports to point to built artifacts instead of raw TypeScript source

  Package exports were incorrectly pointing to raw `.ts` source files, which required consumers to have a TypeScript-aware bundler. Exports now correctly resolve to compiled `.js` and copied `.json` files in `dist/`.

## 0.30.1

### Patch Changes

- 2d0ba13: Migrate the internal CLI runtime from Effect v3 packages to Effect v4 beta while preserving the existing `adamantite` command surface and preset exports.
- 132d654: Include `knip` in `adamantite update` dependency checks

  `adamantite init` installs `knip`, but `adamantite update` wasn't checking it for version updates. Now `knip` is included alongside `oxlint`, `oxfmt`, and `sherif` so users get prompted when their version falls behind.

## 0.30.0

### Minor Changes

- a0234da: Upgrade bundled `oxlint` to `1.50.0` and `oxfmt` to `0.35.0`, including updated internal package pins used during Adamantite setup and updates.

  Update formatting presets to canonical oxfmt option names (`sortImports`, `sortTailwindcss`, and `sortPackageJson`) and enable new unicorn checks in the core lint preset (`unicorn/prefer-module` and single-line `unicorn/prefer-ternary`).

- 506516c: Migrate lint presets from JSON to TypeScript config modules using oxlint's `defineConfig()`.

  All lint presets (`core`, `react`, `nextjs`, `vue`, `node`, `jest`, `vitest`) are now `.ts` files exported via `adamantite/lint` and `adamantite/lint/*`. `adamantite init` generates `oxlint.config.ts` instead of `.oxlintrc.json`, and `adamantite update` automatically migrates legacy `.oxlintrc.json` files—preserving custom rules, existing preset references (both `node_modules` paths and package exports), and non-Adamantite extends entries—then removes the old JSON config.

  When both `oxlint.config.ts` and `.oxlintrc.json` exist, Adamantite prefers the TypeScript config and warns about the duplicate.

### Patch Changes

- 2b1f4e1: Allow trailing commas in JSON/JSONC config parsing.
- 506516c: Improve CLI error reporting when config parsing fails during commands like `adamantite init`.

  When Adamantite fails to parse JSON/JSONC files, it now reports the affected file path and parser details instead of only surfacing a generic tagged error. Invalid config shape errors are also reported with a clearer message explaining that a JSON object is required.

- 6a1d09d: Improve CLI error handling with clearer, user-facing messages across command failures.

  Adds more actionable JSON/JSONC parse diagnostics and centralizes prompt cancellation handling in the prompter service so cancellation behavior is consistent across commands.

## 0.29.1

### Patch Changes

- 00b2ef4: - Bump `oxlint-tsgolint` to `0.14.2`.
  - Include `oxlint-tsgolint` in the `adamantite update` dependency check so it gets updated alongside other Adamantite-managed dev dependencies.

## 0.29.0

### Minor Changes

- a46eb5f: Bump oxlint to v1.49.0 and oxfmt to v0.34.0. Add 25 new lint rules across all presets, including `no-shadow`, `prefer-const`, `typescript/no-unnecessary-condition`, `typescript/consistent-type-exports`, `typescript/unified-signatures`, and more. Update tsgolint to v0.14.1. No breaking changes to the preset configuration.

### Patch Changes

- 9b561ec: Replace `default-case` rule with smarter `switch-exhaustiveness-check` configuration. Switches on union types now require either all members to be handled or a `default` case, and non-union switches require a `default`.
- 6c869b6: Bump knip to v5.85.0. Includes parser/runtime compatibility fixes, improved Next.js and tsdown handling, and large monorepo memory improvements.
- 65d6205: Bump `effect` to v3.19.19.

## 0.28.1

### Patch Changes

- 525d5da: Propagate CLI exit codes so CI fails on tool errors.

## 0.28.0

### Minor Changes

- d9210c3: Add Zed editor support

  The `init` command now configures Zed alongside VS Code/Cursor/Windsurf. Creates `.zed/settings.json` with oxlint and oxfmt LSP settings, enables format-on-save for JS/TS/JSON/CSS/HTML/Markdown/YAML, and prompts to install the `oxc` extension.

- a49bd3f: Replace tsgo with standard TypeScript compiler (tsc) for type checking

  The `typecheck` command now uses `tsc` instead of the experimental `@typescript/native-preview` (tsgo). This provides better stability and compatibility since tsgo is still in development. Commands no longer require package manager detection to run - they execute tools directly.

## 0.27.4

### Patch Changes

- fdaa945: Update lint/format/tooling dependencies and align internal version metadata.

## 0.27.3

### Patch Changes

- 8656cbe: Update development dependencies for tooling and type support

## 0.27.2

### Patch Changes

- 687d41c: Fix `typecheck` command to use `Options.file` instead of `Options.text` for the `--project` option, ensuring proper file path validation for tsconfig.json paths.

## 0.27.1

### Patch Changes

- 787fb7c: Fix `MissingPackageVersion` error when running CLI in packages without a version field

## 0.27.0

### Minor Changes

- 461bbd7: Add new rules from oxlint v1.39.0 and oxfmt v0.24.0:

  **Core preset (`typescript/`):**

  - `typescript/prefer-optional-chain` - Prefer using optional chain expressions instead of logical AND chains

  **Vitest preset:**

  - `vitest/consistent-each-for` - Enforce consistent usage of `each` for test cases
  - `vitest/hoisted-apis-on-top` - Ensure Vitest hoisted APIs are at the top
  - `vitest/no-unneeded-async-expect-function` - Disallow unnecessary async in expect functions
  - `vitest/prefer-called-once` - Prefer using `toHaveBeenCalledOnce()` over `toHaveBeenCalledTimes(1)`
  - `vitest/prefer-describe-function-title` - Prefer using function names in describe blocks

  **Vue preset:**

  - `vue/no-arrow-functions-in-watch` - Disallow arrow functions in watch options
  - `vue/no-lifecycle-after-await` - Disallow lifecycle hooks after await expressions

  **Notable bug fixes in oxlint v1.39.0:**

  - Fix workspace worker selection for nested and similar-named workspaces in LSP
  - Fix `consistent-indexed-object-style` false positive with circular references
  - Fix `consistent-indexed-object-style` to skip fixing default exported interfaces
  - Fix `prefer-called-once` panic on trailing comma
  - Fix panic on invalid `no-unused-vars` configuration
  - Move `jsx-a11y/no-static-element-interactions` rule to nursery
  - Fix nested search for binaries in VS Code extension

  **Notable bug fixes in oxfmt v0.24.0:**

  - Fix classes being stripped when both `experimentalTailwindcss` and `experimentalSortImports` are enabled
  - Fix nested class strings not respecting `singleQuote: true` in Tailwind CSS
  - Fix class names being broken after sorting when containing single quotes with `singleQuote: true`
  - Fix incorrect type annotation check for short arguments
  - Fix parenthesis wrapping for type assertions in default exports

### Patch Changes

- ee94947: Update tooling dependencies to latest versions for improved stability and performance.

## 0.26.0

### Minor Changes

- 0663946: Remove support for passing positional file lists to `adamantite analyze`.

  Use your Knip config (or run `knip` directly) to scope analysis instead.

## 0.25.0

### Minor Changes

- db437e7: Replace Tailwind CSS lint preset with experimental formatting options

  The `adamantite/lint/tailwind` preset has been removed. Tailwind CSS class sorting is now handled via oxfmt's `experimentalTailwindcss` option, which is already enabled in the `adamantite` format preset.

  If you were using the Tailwind lint preset, simply remove it from your configuration. Class sorting will be handled automatically when formatting with `adamantite format`.

## 0.24.0

### Minor Changes

- 32c0900: Add Tailwind CSS lint preset via eslint-plugin-better-tailwindcss

  New framework-specific preset available at `adamantite/lint/tailwind` for projects using Tailwind CSS. Includes rules for class ordering, duplicate detection, and best practices via [eslint-plugin-better-tailwindcss](https://www.npmjs.com/package/eslint-plugin-better-tailwindcss).

  Refactored oxlint helper to support plugin architecture for extensibility.

## 0.23.0

### Minor Changes

- c09d6de: Reorganize preset directory structure and update linting rules

  **Breaking Changes:**

  - Renamed `presets/oxfmt.json` → `presets/format.json`
  - Renamed `presets/oxlint/` → `presets/lint/`
  - Removed 8 linting rules from core preset:
    - `import/export` - Duplicate export detection (now handled by TypeScript)
    - `import/no-named-as-default` - Named import conflicts (now handled by TypeScript)
    - `import/no-named-as-default-member` - Member access on default export (now handled by TypeScript)
    - `new-cap` - Constructor capitalization (stylistic preference)
    - `typescript/only-throw-error` - Enforce throwing Error objects (too restrictive)
    - `unicorn/no-anonymous-default-export` - Require named exports (too opinionated)
    - `unicorn/no-array-for-each` - Prefer for-of over forEach (stylistic preference)
    - `unicorn/prefer-string-raw` - Use String.raw for template literals (too aggressive)
  - Added 1 new linting rule:
    - `sort-keys` - Enforce sorted object keys for consistency

  Users referencing these presets directly in their configuration files will need to update their paths. If you're extending Adamantite presets using the `adamantite/*` shorthand (e.g., `"extends": "adamantite/lint"`), no changes are required.

  **Also includes:**

  - Update oxlint to 1.37.0 (from 1.36.0)
  - Update oxfmt to 0.22.0 (from 0.21.0)
  - Update knip to 5.80.0 (from 5.79.0)
  - Enable type-aware linting in VSCode settings

## 0.22.1

### Patch Changes

- 278b75b: Improve dependency installation performance by batching packages

  Install and update commands now install multiple dependencies in a single package manager call instead of sequentially, reducing total installation time.

## 0.22.0

### Minor Changes

- 15f55ba: Add knip preset for dependency analysis

  Ships new `adamantite/analyze` preset with opinionated knip rules for detecting unused files, dependencies, and exports. Includes sensible defaults: errors on unused files/dependencies, warnings on unused exports/types, and ignores common build/dist directories.

  The init command now installs relevant VS Code extensions based on selected scripts (OXC for lint/fix, Knip for analyze, TypeScript Native Preview for typecheck).

  Also updates oxlint core rules to allow tagged templates and ternaries in expressions.

  Updates tooling dependencies: knip 5.79.0, oxfmt 0.21.0, oxlint 1.36.0, oxlint-tsgolint 0.10.1, and TypeScript native preview 7.0.0-dev.20260103.1.

## 0.21.0

### Minor Changes

- e29fd96: Add `analyze` command for finding unused code with knip

  Finds unused dependencies, exports, and files in your project. Supports `--fix` to auto-remove issues and `--strict` for production-focused analysis.

## 0.20.0

### Minor Changes

- 5849d6c: Add automatic editor extension installation during setup

  The `init` command now prompts to install recommended editor extensions (like oxc.oxc-vscode) automatically, improving the initial setup experience.

## 0.19.0

### Minor Changes

- fa77059: Add tsgo (TypeScript Go) as type checker

  The `typecheck` command now uses `tsgo` instead of `tsc` for faster type checking. During initialization, `@typescript/native-preview` is installed instead of `typescript`.

### Patch Changes

- 00fe130: Add framework preset selection to init command

  The `adamantite init` command now prompts for presets (React, Next.js, Vue, Jest, Vitest, Node) when choosing linting scripts. Selected presets are automatically applied to the oxlint configuration, eliminating manual setup.

  Also adds new framework presets with complete rule sets: Next.js (`nextjs.json`), Jest (`jest.json`), Vitest (`vitest.json`), and Vue.js (`vue.json`). Expands React preset (`react.json`) with React/JSX-a11y/React-perf rules and adds `node/no-exports-assign` to Node.js preset (`node.json`).

## 0.18.0

### Minor Changes

- b0ccb57: Replace Biome with oxlint and oxfmt for linting and formatting

  **Breaking changes:**

  - `biome.jsonc` is no longer supported - use `.oxlintrc.json` and `.oxfmtrc.jsonc` instead
  - Configuration now extends `adamantite/lint` (oxlint) and uses oxfmt for formatting
  - Biome must be uninstalled - `oxlint` and `oxfmt` are the new peer dependencies
  - CLI commands (`check`, `fix`, `format`) now use oxlint/oxfmt instead of Biome

  **New features:**

  - Modular oxlint presets: `core`, `react`, and `next` configurations
  - 500+ linting rules (up from 200+ with Biome)
  - 10-40x faster linting performance
  - Separate formatting configuration via oxfmt

  Run `adamantite update` to migrate existing projects automatically.

- 6a43df7: Add `typecheck` command to run TypeScript type checking

  Runs `tsc --noEmit` to check for type errors. Supports `--project` flag to specify custom tsconfig path and `--watch` flag for continuous type checking.

  Improve generated GitHub Actions workflows with matrix strategy, caching, and optimizations. Workflows now use a matrix strategy to run jobs in parallel, cache dependencies for faster builds, skip documentation-only changes, and use minimal required permissions.

## 0.17.0

### Minor Changes

- f929f82: Add optional GitHub Actions workflow setup during init
  - Added a new prompt during `adamantite init` to optionally create a GitHub Actions workflow
  - The workflow runs all enabled check scripts (check, format, typecheck, check:monorepo)
  - Automatically uses the detected package manager (npm, yarn, pnpm, or bun) with the correct setup steps
  - Creates `.github/workflows/adamantite.yml` with proper caching and concurrency settings
  - Removed the `ci` command in favor of the generated workflow approach

## 0.16.0

### Minor Changes

- 18abadb: Add TypeScript checking option and improve preset export naming

  **Breaking Change:**

  - **Export path update**: The TypeScript preset export has been renamed from `adamantite/tsconfig` to `adamantite/typescript` for better clarity and consistency with package naming conventions

  **New Features:**

  - **TypeScript checking option**: The `init` command now includes a `typecheck` script option that runs `tsc --noEmit` for type-checking without emitting files
  - **Conditional TypeScript installation**: TypeScript is now only installed as a dependency when the `typecheck` option is selected, reducing unnecessary dependencies
  - **Enhanced init flow**: Users can now choose to include TypeScript type-checking as part of their development workflow during initialization

  **Migration:**

  If you're currently using the TypeScript preset, update your `tsconfig.json`:

  ```diff
  {
  -  "extends": "adamantite/tsconfig"
  +  "extends": "adamantite/typescript"
  }
  ```

## 0.15.0

### Minor Changes

- 4f94699: Add `format` command powered by oxfmt

  Formats JavaScript, TypeScript, JSX, TSX, JSON, JSONC, and CSS files using oxfmt (oxc's formatter). The formatter is configured via `.oxfmtrc.json` with opinionated defaults including:

  - 100 character line width
  - 2 space indentation
  - No semicolons
  - Sorted imports with customizable grouping
  - Trailing commas for ES5 compatibility

  Configuration is automatically generated when running `adamantite init` or `adamantite update`. VSCode settings are updated to use oxc-vscode extension as the default formatter.

- 69cb0be: Improve `init` and `monorepo` commands with better UX

  The `init` command now provides clearer interactive prompts using @clack/prompts, detects monorepo configurations automatically, and offers granular control over which scripts to install. Users can choose individual scripts (check, fix, check:monorepo, fix:monorepo) instead of all-or-nothing installation.

  The `monorepo` command now requires the `--fix` flag to auto-fix issues. Running without the flag only checks for issues, making the behavior consistent with the `check` command and preventing unintended modifications.

### Patch Changes

- ded7779: Update faultier dependency to improve error handling and CLI output

## 0.14.2

### Patch Changes

- 1cd1eea: Improve error handling and refactor CLI commands for consistency

  **Error Handling Improvements:**

  - Enhanced error logging for package manager detection failures across all CLI commands
  - Improved user cancellation handling in interactive prompts (`init`, `update`)
  - Commands now display clearer error messages when operations fail, making troubleshooting easier

  **Refactoring:**

  - Refactored all CLI commands (`check`, `ci`, `fix`, `monorepo`, `init`, `update`) to use `.match()` method on `safeTry` results for consistent error handling pattern
  - Standardized error handling across the codebase, improving maintainability and readability
  - Cleaned up unnecessary intermediate variable assignments in `init` command

  **Type Improvements:**

  - Updated `types.ts` with more precise type definitions, using `never` for empty error data and optional properties where appropriate

## 0.14.1

### Patch Changes

- f2a9cd1: Migrate build tool from tsdown to bunup

  Updates the build configuration to use bunup instead of tsdown for bundling the CLI. This is an internal tooling change that improves build performance and aligns with Bun's ecosystem, with no impact on the public API or CLI functionality.

- 9c4ba8c: Improve error handling across CLI commands

  Enhances error handling in all CLI commands by adding proper error logging for package manager detection failures and improving user cancellation handling in interactive prompts. Commands now display clearer error messages when package manager detection fails or when users cancel interactive operations, making troubleshooting easier and providing better user experience.

## 0.14.0

### Minor Changes

- a3edadb: Improve Biome preset defaults and refactor internal error handling

  This release updates the Biome formatter preset with more practical defaults and includes significant internal improvements to error handling and code organization. All changes are backwards compatible - CLI commands and package exports remain unchanged.

  **Biome Preset Updates:**

  - **Increased line width** from 80 to 100 characters for better readability on modern displays
  - **Relaxed cognitive complexity** rule from error to warning level and increased threshold from 20 to 40 for more pragmatic complexity checks
  - These changes will affect formatting and linting output but can be overridden in your local `biome.jsonc` configuration

  **Internal Refactoring:**

  - **Result-based error handling**: Introduced `neverthrow` library for type-safe error handling across all commands, replacing try-catch patterns with composable Result types
  - **Improved error messages**: All commands now provide better error context using structured error flattening
  - **Modular helper organization**: Restructured helper functions from monolithic file into organized modules:
    - `src/helpers/editors/vscode.ts` - VSCode configuration
    - `src/helpers/packages/biome.ts` - Biome package management
    - `src/helpers/packages/sherif.ts` - Sherif package management
    - `src/helpers/tsconfig.ts` - TypeScript configuration
  - **Relocated preset files** from `src/presets/` to `presets/` directory (package exports unchanged - users are unaffected)

  **Dependencies:**

  - Added `neverthrow@8.2.0` for Result type handling
  - Added `faultier@^1.0.3` for error utilities
  - Moved `yargs` from devDependencies to dependencies

## 0.13.2

### Patch Changes

- 00b3f0c: Refactor CLI framework from citty to yargs for improved command parsing

  This internal refactoring migrates the CLI implementation to use yargs instead of citty, providing more robust argument parsing and better TypeScript support. The change also introduces import maps with "#\*" syntax for cleaner internal module resolution.

  **Technical changes:**

  - Migrated all command handlers from citty's `defineCommand` to yargs command modules
  - Added `#*` import maps in package.json pointing to `./src/*` for path-based imports
  - Updated all internal imports to use `#commands/*` and `#utils.ts` syntax
  - Added yargs and @types/yargs dependencies (replacing citty)
  - Configured TypeScript with `allowImportingTsExtensions` and `noEmit` for import map support
  - Updated tsdown config to target node platform explicitly

  All CLI commands maintain their existing behavior and user-facing API.

## 0.13.1

### Patch Changes

- c34d925: Update dependency versions to fix test failures

  **Updated Dependencies:**

  Development dependencies:

  - `@biomejs/biome` from 2.3.8 to 2.3.10
  - `@types/bun` from 1.3.3 to 1.3.5
  - `tsdown` from 0.17.0-beta.4 to 0.18.1
  - `type-fest` from 5.2.0 to 5.3.1

  Peer dependencies:

  - `@biomejs/biome` from 2.3.8 to 2.3.10

  **Internal Changes:**

  - Updated hardcoded `biome.version` in helpers from 2.3.2 to 2.3.10 to match installed package
  - Updated hardcoded `sherif.version` in helpers from 1.7.0 to 1.9.0 to match installed package

  These changes ensure version consistency between hardcoded references in the codebase and actual installed dependencies, resolving test failures that check for version alignment.

- 89f6f83: Add self-referencing dependency and update development tooling

  **New Features:**

  - Added `adamantite` as a dependency to enable dogfooding and self-testing of the package configuration

  **Updated Dependencies:**

  Development dependencies:

  - `sherif` from 1.7.0 to 1.7.1
  - `tsdown` from 0.15.11 to 0.15.12

  This change allows the project to use its own presets and configurations, ensuring consistency and validating that the package works correctly in real-world usage. The development dependency updates bring the latest bug fixes and improvements from upstream packages.

- d354b60: Update development dependencies and Biome peer dependency to latest versions

  **Updated Dependencies:**

  Development dependencies:

  - `@biomejs/biome` from 2.3.2 to 2.3.8
  - `@changesets/cli` from 2.29.7 to 2.29.8
  - `@types/bun` from 1.3.1 to 1.3.3
  - `sherif` from 1.7.1 to 1.9.0
  - `tsdown` from 0.15.12 to 0.17.0-beta.4
  - `type-fest` from 5.1.0 to 5.2.0

  Peer dependencies:

  - `@biomejs/biome` from 2.3.2 to 2.3.8

  Package manager:

  - `bun` from 1.2.20 to 1.3.3

  These updates bring the latest bug fixes, performance improvements, and new features from upstream packages, ensuring the development environment stays current with the latest tooling improvements.

## 0.13.0

### Minor Changes

- 073c7a8: Update Biome to 2.3.2 and enable script/style tag indentation

  **Updated Dependencies:**

  Core dependencies:

  - `@biomejs/biome` from 2.3.0 to 2.3.2

  Development dependencies:

  - `tsdown` from 0.15.9 to 0.15.11

  **Configuration Changes:**

  - **Script and style indentation**: Changed `indentScriptAndStyle` from `false` to `true` in the HTML formatter configuration. This enables automatic indentation of code within `<script>` and `<style>` tags in HTML and JSX files, improving code readability and consistency. Previously, content within these tags was not indented, but now they will be formatted with proper indentation matching the rest of the document.

  These updates bring the latest bug fixes and improvements from Biome 2.3.2, along with enhanced formatting consistency for HTML and JSX files containing embedded scripts and styles.

## 0.12.0

### Minor Changes

- 0b1598e: Update Biome to 2.3.0 and improve configuration defaults

  **Updated Dependencies:**

  Core dependencies:

  - `@biomejs/biome` from 2.2.6 to 2.3.0

  Development dependencies:

  - `@types/bun` from 1.3.0 to 1.3.1
  - `sherif` from 1.6.1 to 1.7.0
  - `tsdown` from 0.15.7 to 0.15.9

  **Configuration Changes:**

  - **Line endings**: Changed from `"lf"` to `"auto"` for better cross-platform compatibility. The formatter will now preserve the existing line ending style in files rather than enforcing Unix-style line endings.
  - **New rule**: Added `useImageSize` rule (set to `"error"`) to enforce width and height attributes on image elements for improved performance and layout stability.

  **Development Environment:**

  - VSCode settings updated to use Biome as the default formatter
  - Added `test/` directory for future test infrastructure

  These updates bring the latest improvements and bug fixes from Biome 2.3.0, along with enhanced cross-platform support and additional best practices for web development.

## 0.11.1

### Patch Changes

- 3121c4e: Update development dependencies to their latest versions

  Updated the following devDependencies:

  - `@biomejs/biome` from 2.2.5 to 2.2.6
  - `@types/bun` from 1.2.23 to 1.3.0
  - `tsdown` from 0.15.6 to 0.15.7
  - `type-fest` from 5.0.1 to 5.1.0

  These updates include minor improvements and bug fixes from the upstream packages.

## 0.11.0

### Minor Changes

- 4df55ba: Restructure Biome configuration to use extends pattern and move presets to src directory

  **Breaking Changes:**

  The package structure has been reorganized to consolidate presets in the `src/presets` directory and adopt a more maintainable configuration pattern:

  - **Biome configuration**: The root `biome.jsonc` now extends from `src/presets/biome.jsonc` instead of containing the full configuration inline
  - **TypeScript preset**: Moved from `presets/tsconfig.json` to `src/presets/tsconfig.json` for consistency
  - **Package exports**: Added clean export paths via package.json exports field:
    - `adamantite` → Biome configuration (default export)
    - `adamantite/biome` → Biome configuration (explicit)
    - `adamantite/tsconfig` → TypeScript configuration (new clean path)
    - `adamantite/presets/*` → Direct preset access (fallback)
  - **Schema references**: Updated to use local Biome schema paths (`./node_modules/@biomejs/biome/configuration_schema.json`) instead of remote URLs
  - **TypeScript preset**: Removed `verbatimModuleSyntax` setting to improve compatibility with both ESM and CommonJS projects

  **Migration:**

  If you're importing Adamantite's Biome configuration:

  - Update imports from `adamantite/biome.jsonc` to `adamantite` (the package main export)
  - If extending the TypeScript preset, update the path from `adamantite/presets/tsconfig.json` to `adamantite/tsconfig`
  - If your project relies on `verbatimModuleSyntax`, add it to your local tsconfig.json as it's no longer included in the preset

  **Internal improvements:**

  - Tests now validate local schema paths instead of remote URL formats, improving offline development experience
  - Configuration structure better aligns with modern preset patterns using `extends`

## 0.10.0

### Minor Changes

- f975e73: /

## 0.9.5

### Patch Changes

- 1aa1ba2: Enhanced `useFilenamingConvention` rule to support special characters in filenames

  Updated the filename convention rule with a custom `match` regex pattern that allows special characters such as `$`, `[`, and `]` in filenames while maintaining kebab-case naming conventions. This change enables proper validation of framework-specific file naming patterns, such as Next.js dynamic routes (`[id].ts`, `[...slug].ts`) and SvelteKit route parameters (`$lib`, `[param].svelte`), without triggering false positive linting errors.

## 0.9.4

### Patch Changes

- cd272f9: Allow non-ASCII characters in filenames by setting `requireAscii: false` in the `useFilenameConvention` rule

  The Biome configuration now permits special characters like `$` in filenames while maintaining the `kebab-case` naming requirement. This change resolves linting errors for route files with special characters (e.g., `auth.$.ts` in web frameworks that use `$` for dynamic routes) without compromising the overall filename convention standards.

## 0.9.3

### Patch Changes

- 4b6df97: Migrate CLI framework from Commander.js to citty for improved developer experience. This change brings better type safety through citty's TypeScript-first design, improved ergonomics as part of the UnJS ecosystem, and a more declarative command definition API.

  Key improvements:

  - **Better type safety**: Commands are now defined using `defineCommand()` with fully typed argument definitions
  - **Declarative API**: Command metadata, arguments, and handlers are defined in a single, clear structure rather than chained method calls
  - **Improved DX**: Arguments are automatically parsed and typed, with built-in support for positional arguments, boolean flags, and command metadata
  - **UnJS ecosystem**: citty is part of the UnJS ecosystem, providing better compatibility with other modern JavaScript tooling and conventions

- 67d8ea3: Update development dependencies and TypeScript peer dependency requirement

  - Update tsdown from 0.15.2 to 0.15.6 for improved build performance and bug fixes
  - Update type-fest from 5.0.0 to 5.0.1 for latest type utilities
  - Update TypeScript from 5.9.2 to 5.9.3 for latest compiler improvements
  - Update TypeScript peer dependency to >=5.6.0 (required for noUncheckedSideEffectImports compiler option)

  This ensures compatibility with the TypeScript preset's `noUncheckedSideEffectImports` option which requires TypeScript 5.6 or higher.

## 0.9.2

### Patch Changes

- 590dbfd: Relax filename convention rules in Biome configuration

  Removed the restrictive `match` pattern constraint from the `useFilenameConvention` rule while keeping the `kebab-case` requirement. This change makes the linting rules more permissive by removing the overly restrictive regex pattern matching, which can help reduce false positives in projects with diverse naming requirements.

## 0.9.1

### Patch Changes

- 16eef0d: Remove Next.js-specific Biome rules from general-purpose TypeScript preset

  Removed `noHeadElement` and `noHeadImportInDocument` rules that are specific to Next.js framework usage. These rules prevent using HTML `<head>` elements and importing head-related functionality in wrong contexts, but they can cause false positives and confusion in non-Next.js TypeScript projects.

  As a general-purpose TypeScript preset, Adamantite should focus on universal TypeScript and JavaScript best practices rather than framework-specific rules. Projects using Next.js can enable these rules through Biome's Next.js domain configuration when needed.

## 0.9.0

### Minor Changes

- 6d7a5a3: Add noUncheckedSideEffectImports to TypeScript preset for enhanced type safety

  The TypeScript preset now includes the `noUncheckedSideEffectImports` compiler option, which helps prevent potential runtime errors from unchecked side effects in imports. Additionally, compiler options in the preset have been reorganized alphabetically for better maintainability.

### Patch Changes

- 3c86461: Update dependencies to latest versions for improved stability and performance
  - Update Biome from 2.2.2 to 2.2.4
  - Update commander from 14.0.0 to 14.0.1
  - Update nypm from 0.6.1 to 0.6.2
  - Update build and development dependencies (tsdown, type-fest, @changesets/cli, @types/bun)

## 0.8.0

### Minor Changes

- b8ed24b: Rename CLI commands for clearer intent: `lint` → `check` and `format` → `fix`

  **Breaking Changes:**

  - The `lint` command is now `check` and only reports issues (no auto-fixing)
  - The `format` command is now `fix` and applies formatting and lint fixes
  - Update your scripts and workflows to use the new command names

  **Migration:**

  - Replace `adamantite lint` with `adamantite check` (for checking only)
  - Replace `adamantite format` with `adamantite fix` (for fixing issues)

## 0.7.2

### Patch Changes

- dfa0225: Update Biome to v2.2.2 for improved linting and formatting

## 0.7.1

### Patch Changes

- 9793d28: Refactor dependency management to use nypm API and improve update command reliability
  - Replace custom `runProcess` utility with nypm's `dlxCommand` and `addDevDependency` functions
  - Improve package manager detection using nypm's built-in detection instead of manual lock file checking
  - Update all command files to use consistent error handling and execution patterns
  - Remove unused utilities and corresponding test cases
  - Fix update command error handling to use Promise.allSettled() instead of sequential await in loops
  - Enhance update command to attempt all dependency updates and report detailed success/failure status
  - Improve TypeScript compatibility and resolve linter warnings in update command
  - Add nypm as a dependency to enable more robust package manager operations

## 0.7.0

### Minor Changes

- a6a1853: Add `ci` command for continuous integration workflows with enhanced reporter options.

  ## CLI Enhancements
  - **Added**: `ci` command for running Biome CI checks in continuous integration environments
  - **Added**: `--github` flag to the `ci` command for GitHub Actions reporter output
  - **Added**: `--monorepo` flag to the `ci` command for additional monorepo-specific checks using Sherif
  - **Refactored**: Command option handling to use consistent destructured options pattern across all commands

  This update adds CI-specific functionality optimized for automated environments while maintaining compatibility with existing lint and format commands.

## 0.6.0

### Minor Changes

- 427b34f: Comprehensive update to Biome configuration rules with stricter linting and formatting standards.

  ## Rule Changes

  ### A11y Section
  - **Added**: `noAutofocus` - error (previously off)
  - **Added**: `noNoninteractiveElementInteractions` - error
  - **Reorganized**: Better organization with JavaScript and CSS subsections
  - **Removed**: Verbose rule comments for cleaner configuration

  ### Complexity Section
  - **Added 25+ new rules** including:
    - `noExtraBooleanCast` - error
    - `noStaticOnlyClass` - error
    - `noThisInStatic` - error
    - `noUselessContinue` - error
    - `noUselessEmptyExport` - error
    - `noUselessEscapeInRegex` - error
    - `noUselessFragments` - error
    - `noUselessLabel` - error
    - `noUselessLoneBlockStatements` - error
    - `noUselessRename` - error
    - `noUselessStringConcat` - error
    - `noUselessStringRaw` - error
    - `noUselessSwitchCase` - error
    - `noUselessTernary` - error
    - `noUselessThisAlias` - error
    - `noUselessTypeConstraint` - error
    - `noUselessUndefinedInitialization` - error
    - `useArrowFunction` - error
    - `useDateNow` - error
    - `useFlatMap` - error
    - `useLiteralKeys` - error
    - `useNumericLiterals` - error
    - `useOptionalChain` - error
    - `useRegexLiterals` - error
    - `useSimpleNumberKeys` - error
  - **Changed**: `maxAllowedComplexity` increased from 18 to 20

  ### Correctness Section
  - **Added**: `noGlobalDirnameFilename` - error
  - **Added**: `noNestedComponentDefinitions` - error
  - **Added**: `noProcessGlobal` - off
  - **Added**: `useJsonImportAttributes` - error
  - **Added**: `useParseIntRadix` - error
  - **Added**: `useSingleJsDocAsterisk` - error
  - **Added**: `useUniqueElementIds` - error (previously off)
  - **Added**: `noReactPropAssignments` - error
  - **Added**: `noRestrictedElements` - error
  - **Removed**: `noUndeclaredDependencies` - off
  - **Removed**: `useImportExtensions` - off

  ### Nursery Section
  - **Enabled previously disabled rules**:
    - `noFloatingPromises` - error (was off)
    - `noMisusedPromises` - error (was off)
  - **Added**: `noNonNullAssertedOptionalChain` - error
  - **Added**: `noUnnecessaryConditions` - error
  - **Added**: `useReactFunctionComponents` - error
  - **Added**: `useAnchorHref` - error
  - **Removed**: `useExplicitType` - off
  - **Removed**: `noSecrets` - off
  - **Removed**: `noImportCycles` - off

  ### Performance Section
  - **Removed**: `noBarrelFile` - off
  - **Removed**: `noImgElement` - error
  - **Removed**: `noNamespaceImport` - off
  - **Removed**: `noReExportAll` - off

  ### Style Section
  - **Added**: `useConsistentObjectDefinitions` - error
  - **Added**: `useExportsLast` - error (was off)
  - **Added**: `useGroupedAccessorPairs` - error
  - **Added**: `useNumericSeparators` - error
  - **Added**: `useObjectSpread` - error
  - **Added**: `useSymbolDescription` - error
  - **Changed**: `useExplicitLengthCheck` - error (was off)
  - **Changed**: `useSingleVarDeclarator` - error (was off)
  - **Removed**: `noCommonJs` - off
  - **Removed**: `noDefaultExport` - off
  - **Removed**: `noNestedTernary` - off
  - **Removed**: `noProcessEnv` - off
  - **Removed**: `useComponentExportOnlyModules` - off

  ### Suspicious Section
  - **Added**: `noBitwiseOperators` - error
  - **Added**: `noConstantBinaryExpressions` - error
  - **Added**: `noTsIgnore` - error
  - **Added**: `noUselessEscapeInString` - error
  - **Added**: `noUselessRegexBackrefs` - error
  - **Added**: `useIterableCallbackReturn` - error
  - **Added**: `useStaticResponseMethods` - error
  - **Added**: `noBiomeFirstException` - error
  - **Added**: `noQuickfixBiome` - error

  ## CLI Enhancements
  - **Added**: `--summary` flag to the `lint` command for concise lint result reporting using Biome's summary reporter

  This update significantly strengthens the linting rules with a focus on code quality, consistency, and best practices while maintaining TypeScript and React compatibility.

### Patch Changes

- 6922455: remove noBarrelFile rule

## 0.5.1

### Patch Changes

- d0f9127: Update Biome version from 2.1.4 to 2.2.0
  - Updated package dependency and configuration schema
  - Migrated renamed rules to new naming conventions
  - Moved promoted rules from nursery to stable groups:
    - `noAwaitInLoops` moved to performance group
    - `noUselessRegexBackrefs` moved to suspicious group
  - Added new rules:
    - `noBarrelFile`

## 0.5.0

### Minor Changes

- ee92238: Add `update` command to keep dependencies in sync

  Adds a new `adamantite update` command that updates installed dependencies (@biomejs/biome and sherif) to match the versions specified by adamantite. The command automatically detects the package manager, compares versions, and updates only outdated packages with user confirmation.

## 0.4.1

### Patch Changes

- 97afed7: Fix init command and improve codebase maintainability
  - **Fix init command crash**: Removed getBiomeVersion function that was causing "Failed to get Biome version" errors when users didn't have Biome installed yet
  - **Improved helpers architecture**:
    - Made version property optional for non-package helpers (tsconfig, vscode)
    - Only biome and sherif helpers now have versions (actual npm packages)
    - Moved package versions into respective helper objects for better organization
  - **Enhanced helper functionality**:
    - Fixed vscode helper to properly create .vscode directory
    - Updated config merging to prioritize adamantite settings over existing user configs
    - Added comprehensive integration tests with temporary directory isolation
  - **Code cleanup**:
    - Removed unused utility functions (isPackageInstalled, getInstalledPackageVersion, isPackageVersionCorrect)
    - Consolidated all test files into **tests** directory
    - Removed 335+ lines of unused code and tests
  - **Improved test organization**:
    - Added semantic test descriptions explaining what and why we're testing
    - Created separate integration tests for file operations
    - Better test structure with nested describe blocks

## 0.4.0

### Minor Changes

- c7edd5c: add editor rules for vscode

### Patch Changes

- 78a93ea: update biome version to 2.1.4
- d0906c4: pin all versions to exact
- 9d10cf1: update typescript peer dependency range
- bdf3962: new title

## 0.3.4

### Patch Changes

- 9280e56: remove package.json caching

## 0.3.3

### Patch Changes

- 97c8ab3: fix monorepo lint script

## 0.3.2

### Patch Changes

- 5f5b8f4: fix `bin` location

## 0.3.1

### Patch Changes

- 1af8e2c: add version title to new version PR

## 0.3.0

### Minor Changes

- c23ec2e: - Add support for running `sherif` to automatically fix monorepo-specific issues
  - Add support for detecting the package manager and using the correct executable path

## 0.2.0

### Minor Changes

- 8d76fbe: Remove unnecessary tsconfig settings

## 0.1.1

### Patch Changes

- e82f852: install `adamantite` during `init`

## 0.1.0

### Minor Changes

- 801a662: Add `init` script

## 0.0.6

### Patch Changes

- 1561814: setup changesets and release workflow
