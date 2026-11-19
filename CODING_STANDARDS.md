# Coding standards

These standards cover choices that require review. The [architecture](docs/architecture.md)
maps the module boundaries and their invariants. [Oxlint](oxlint.config.ts),
[Vitest](vitest.config.ts), and the [build](tsdown.config.ts) enforce the constraints they can
check. A standard that a rule checks has no section here. The rule and the comment beside it, in
[oxlint.config.ts](oxlint.config.ts), in the [config](config) modules that it imports, or in
[.adamantite/lint](.adamantite/lint), are its only source. A section that names a rule states only the part of its standard that the rule cannot
check. Domain terms belong in [GLOSSARY.md](GLOSSARY.md).

## Tests

### Choose the clock that the test controls

Advance `TestClock` before awaiting timed work in an `it.effect` test, or use `it.live` when the
test needs real time. The Effect test clock stays paused until the test advances it.

Spot it: A test joins a fiber that sleeps or times out without advancing the test clock.

```ts
// Avoid: joining the timed detection fiber before advancing its clock.
Effect.gen(function* () {
  const installed = yield* Fiber.join(fiber)
  yield* TestClock.adjust("9 seconds")
  return installed
})

// Prefer: the installed-agent detection test advances the clock first.
Effect.gen(function* () {
  yield* TestClock.adjust("9 seconds")
  yield* Fiber.join(fiber)
})
```

The example comes from the agent order test in
[doctor.test.ts](src/commands/__tests__/doctor.test.ts).
[PR #375](https://github.com/adelrodriguez/adamantite/pull/375) introduced the Effect Vitest setup
and this repository instruction.

## Functions

### Use a standalone arrow only for an Effect chain

Write a standalone function as an arrow only when the call that it returns is an Effect chain, and
declare every other standalone function, in a module and inside another function. The distinction
keeps plain helpers separate from Effect composition. `project/standalone-functions` reports an
arrow that a variable holds when the arrow has a block body or returns a plain value, such as an
object or a comparison. A rule gets no types, so it accepts an arrow that returns any call.

Spot it: A standalone arrow returns a call that is not an Effect chain, such as a type guard that
calls `Array.isArray`.

```ts
// Avoid: the JSON array guard as an arrow, which returns a boolean.
export const checkIsJsonArray = (value: JsonValue | undefined): value is JsonValue[] =>
  Array.isArray(value)

// Prefer: the arrow in filesystem.ts returns an Effect chain.
export const readFile = (path: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path)),
    Effect.mapError((cause) => new FailedToReadFile({ cause, path }))
  )
```

[The JSON helpers](src/lib/shared/json.ts) show the declaration form.
[Filesystem helpers](src/lib/shared/filesystem.ts) show the Effect chains. This moves the existing
rule retained by [PR #344](https://github.com/adelrodriguez/adamantite/pull/344).

## Integrations

### Keep tool behavior with its owner

Put a tool's configuration and companion packages in that tool's folder, and share behavior only
when several tools need it. This keeps the integration definition separate from its helpers
without creating a shared abstraction for one tool.

Spot it: A tool-specific helper enters `tooling/base.ts`, or a companion package becomes a peer of
its host tool.

```ts
// Avoid: the peer integration import from before #472.
import shadcnLint from "#lib/integrations/tooling/shadcn-lint.ts"

// Prefer: the plugin registry keeps the definition under its host tool.
import tailwind from "#lib/integrations/oxlint/plugins/tailwind.ts"
```

[PR #472](https://github.com/adelrodriguez/adamantite/pull/472) moved managed plugins under Oxlint.
[Integrations](docs/architecture.md#integrations) and
[Managed plugins](docs/architecture.md#managed-plugins) in the architecture name the owner of the
integration list, the helper modules, the shared checks, and the plugin definitions.

### Keep lifecycle writes within their command

Keep `init` and `update` deterministic: each applies its selection through `Setup.apply`, then
offers the repair of the findings that remain through `Resolution.offer`, without choosing its
work from them. Keep `assess` and `doctor` read-only. A finding describes a repair for an agent or
a human, and does not authorize another command to make that repair. `project/file-writers`
reports a file write outside the file writers that it lists. This standard covers the changes that
the rule cannot see.

Spot it: An assessment changes the target project without a file write of its own, such as an
install or a tool run that fixes files, or init or update chooses its work from Doctor findings.

```ts
// Avoid: Doctor installed packages before #393.
Effect.gen(function* () {
  yield* dependencyInstaller.addDevDependencies(packages, cwd, { silent: true })
})

// Prefer: Doctor reads the project and renders the assessment.
Effect.gen(function* () {
  const assessment = yield* assessProject(yield* Project.read())
  return assessment
})
```

[PR #393](https://github.com/adelrodriguez/adamantite/pull/393) removed Doctor's repair path.
[Command boundaries](docs/architecture.md#command-boundaries) in the architecture states each
command's work.

### Preserve explicit project choices when defaults change

Preserve a target project's explicit optional setup when changing a generated default. A default
defines fresh setup, and does not remove a user's opt-in.

Spot it: Regenerating a file removes a manually added step, such as a `rule test` step, or another
setting that the project changed.

```ts
// Avoid: regenerating an existing workflow without inspecting its content.
Effect.gen(function* () {
  yield* writeWorkflow(cwd, options)
})

// Prefer: Setup.apply writes a managed file only when its hash equals the recorded hash.
Effect.gen(function* () {
  if (!Option.contains(recorded, yield* hashContent(current.value))) {
    return { hash: Option.none<string>(), write: Kept({ path: file.path }) }
  }
  yield* write
  return { hash, write: Replaced({ path: file.path }) }
})
```

[`Setup.apply`](src/lib/setup/index.ts) keeps a workflow, or any other managed file, that the
project changed, and the integration's `assess` reports only a change that breaks the setup.
[PR #636](https://github.com/adelrodriguez/adamantite/pull/636) fixed the repeated-init path after
review found that it removed the optional test step. A later audit found that the fix matched only
the literal `adamantite rule test` command, so other edits were still lost.

### Keep shared editor commands relative to the workspace

Build editor launch paths from the installed package that resolution finds, including ancestor
installs, and write logical paths relative to the workspace. A local `node_modules` assumption can
produce settings that assessment accepts but the editor cannot run.

Spot it: A generated editor command hard-codes a local dependency path or saves an absolute pnpm
store path in shared settings.

```ts
// Avoid: the Zed command rejected in the review of #633.
const EFFECT_BINARY = {
  arguments: ["node_modules/@effect/tsgo/dist/effect-tsgo.cjs", "tsc", "--lsp", "--stdio"],
  path: "node",
} as const

// Prefer: resolveEffectCli returns a logical path from the workspace.
const resolveEffectCli = Effect.fn("resolveEffectCli")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directory = path.resolve(cwd)
  for (;;) {
    const candidate = path.join(directory, "node_modules", "@effect", "tsgo")
    if (yield* fs.exists(path.join(candidate, "package.json"))) {
      return path
        .relative(cwd, path.join(candidate, "dist", "effect-tsgo.cjs"))
        .replaceAll("\\", "/")
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      return yield* new EffectEditorUnavailable({
        reason:
          "Zed cannot find the installed Effect CLI in node_modules. Install @effect/tsgo, then run `adamantite update`.",
      })
    }
    directory = parent
  }
})
```

The [Zed resolver](src/lib/integrations/zed/index.ts) walks ancestor folders without saving a
real package-store path. [PR #633's review](https://github.com/adelrodriguez/adamantite/pull/633#discussion_r4503357503)
found the broken nested-workspace command and the assessment that accepted it.
