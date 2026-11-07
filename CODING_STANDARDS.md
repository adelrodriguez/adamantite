# Coding standards

These standards cover choices that require review. The [architecture](docs/architecture.md)
describes the module boundaries and lifecycle. [Oxlint](oxlint.config.ts),
[Vitest](vitest.config.ts), and the [build](tsdown.config.ts) enforce the constraints they can
check. Domain terms belong in [GLOSSARY.md](GLOSSARY.md), and decisions belong in the
[ADRs](docs/adr/README.md).

## Tests

### Keep unit filesystem access in memory

Use `createFileSystemTestContext` with `Path.layer` in unit tests, and reserve host filesystem
access for integration tests that start real processes. In-memory fixtures keep unit tests
independent from the machine and from each other.

Spot it: A unit test creates a temporary directory, changes the working directory, or provides
`NodeServices.layer` to obtain a filesystem.

```ts
// Avoid: the broad host layer from the test helper removed in #378.
export function runResult<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R> = NodeServices.layer as Layer.Layer<R>
) {
  const provided = effect.pipe(Effect.provide(layer))
  return provided.pipe(Effect.result)
}

// Prefer: the editor tests create an in-memory context.
function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}
```

The [filesystem helper](src/__tests__/filesystem.ts) exposes fixture operations and a layer.
The [editor tests](src/lib/integrations/editors/__tests__/vscode.test.ts) provide that layer with
`Path.layer`. [PR #378](https://github.com/adelrodriguez/adamantite/pull/378) replaced host-backed
unit tests so they could run independently without changing the machine.

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
  const installed = yield* Fiber.join(fiber)
  return installed
})
```

The example comes from
[coding-agents.test.ts](src/lib/execution/__tests__/coding-agents.test.ts).
[PR #375](https://github.com/adelrodriguez/adamantite/pull/375) introduced the Effect Vitest setup
and this repository instruction.

## Functions

### Declare standalone functions

Use function declarations for standalone functions, and arrows for callbacks, object methods,
and functions that directly return an Effect chain. The distinction keeps plain helpers separate
from Effect composition.

Spot it: A standalone helper uses an arrow even though its body is not an Effect chain.

```ts
// Avoid: turning the standalone Knip workspace helper into an arrow.
const toKnipWorkspace = ({ isMonorepo, lintConfig }: ToolingFacts): KnipWorkspace => ({
  isMonorepo,
  usesEffectPreset: checkImportsLintPreset(lintConfig, "effect"),
})

// Prefer: the declaration in knip/config.ts.
export function toKnipWorkspace({ isMonorepo, lintConfig }: ToolingFacts): KnipWorkspace {
  return {
    isMonorepo,
    usesEffectPreset: checkImportsLintPreset(lintConfig, "effect"),
  }
}
```

[Knip's config helper](src/lib/integrations/tooling/knip/config.ts) shows the declaration form.
[Filesystem helpers](src/lib/shared/filesystem.ts) show the Effect-chain exception. This moves the
existing rule retained by [PR #344](https://github.com/adelrodriguez/adamantite/pull/344).

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
import shadcn from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"
```

[PR #472](https://github.com/adelrodriguez/adamantite/pull/472) moved managed plugins under Oxlint.
The [module seams](docs/architecture.md#module-seams) describe integration exports, helper
modules, the plugin registry, and shared infrastructure.

### Keep lifecycle writes within their command

Keep `init` deterministic and independent from assessment, keep `assess` and `doctor` read-only,
and limit `update` to managed dependencies and the installed Adamantite skill. A finding describes
a repair for an agent or a human, and does not authorize another command to make that repair.

Spot it: An assessment repairs a file, init chooses its work from Doctor findings, or an update
fails because unrelated findings remain.

```ts
// Avoid: Doctor installed packages before #393.
Effect.gen(function* () {
  yield* dependencyInstaller.addDevDependencies(packages, cwd, { silent: true })
})

// Prefer: Doctor reads the project and renders the assessment.
Effect.gen(function* () {
  const assessment = yield* assessProject(yield* readProject(cwd, initialPackageJson))
  return assessment
})
```

[PR #393](https://github.com/adelrodriguez/adamantite/pull/393) removed Doctor's repair path.
[ADR 0002](docs/adr/0002-doctor-instructs-agents-mutate.md) records the decision, and the
[lifecycle reference](docs/architecture.md#integration-lifecycle) describes each command's work.

### Preserve explicit project choices when defaults change

Preserve a target project's explicit optional setup when changing a generated default. A default
defines fresh setup, and does not remove a user's opt-in.

Spot it: Regenerating a workflow removes a manually added `rule test` step or the settings that
the step needs.

```ts
// Avoid: regenerating an existing workflow without inspecting its commands.
Effect.gen(function* () {
  yield* writeWorkflow(cwd, options)
})

// Prefer: github.update preserves an explicit saved-test workflow.
Effect.gen(function* () {
  if (workflow.commands.some((command) => RULE_TEST_COMMAND_REGEX.test(command))) {
    return
  }
  yield* writeWorkflow(cwd, options)
})
```

The [GitHub integration](src/lib/integrations/ci/github.ts) preserves the whole opted-in workflow,
including its Node setup and matrix. [PR #636](https://github.com/adelrodriguez/adamantite/pull/636)
fixed the repeated-init path after review found that it removed the optional test step.

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
          "Zed cannot find the installed Effect CLI in node_modules. Install @effect/tsgo, then run `adamantite init --non-interactive --script check --editor zed`.",
      })
    }
    directory = parent
  }
})
```

The [Zed resolver](src/lib/integrations/editors/zed.ts) walks ancestor folders without saving a
real package-store path. [PR #633's review](https://github.com/adelrodriguez/adamantite/pull/633#discussion_r4503357503)
found the broken nested-workspace command and the assessment that accepted it.
