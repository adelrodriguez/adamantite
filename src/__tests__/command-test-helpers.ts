import { createHash } from "node:crypto"
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stdio from "effect/Stdio"
import { TestClock, TestConsole } from "effect/testing"
import type { DetectedPackageManager } from "#lib/project/package-manager.ts"
import type { Selection } from "#lib/project/selection.ts"
import { configLoaderLayer } from "#__tests__/config-loader.ts"
import {
  type FileSystemTestContext,
  createFileSystemTestContext,
  makeSystemError,
} from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import { createTerminalTestContext, type TerminalTestContext } from "#__tests__/terminal.ts"
import { CodingAgents, codingAgents } from "#lib/handoff/coding-agents.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts" with { type: "macro" }
import { ConfigLoader } from "#lib/project/config-loader.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { LOCKFILE_PATH, Lockfile } from "#lib/project/lockfile.ts"
import { NodeVersionResolver } from "#lib/project/node-version-resolver.ts"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/shared/command-runner.ts"
import { CliNotFound, CommandFailed, type FailedToInstallDependency } from "#lib/shared/errors.ts"
import { ForwardedArguments } from "#lib/shared/forwarded-arguments.ts"
import { RAW_MODE_RELEASE_WAIT } from "#terminal/resolution-menu.ts"

const LockfileJson = Schema.fromJsonString(Lockfile)

/**
 * The lockfile that a command wrote, decoded.
 */
export function readLockfile(files: FileSystemTestContext): Lockfile {
  return Schema.decodeSync(LockfileJson)(files.read(LOCKFILE_PATH))
}

/**
 * A lockfile with `selection` and the hashes of `written`, that Adamantite `version` wrote, as a
 * fixture file.
 */
export function makeLockfileFile(
  selection: Selection,
  written: Readonly<Record<string, string>> = {},
  version = "0.0.0"
) {
  return {
    [LOCKFILE_PATH]: Schema.encodeSync(LockfileJson)({
      schemaVersion: 1,
      selection,
      version,
      written,
    }),
  }
}

/**
 * Where `adamantite/lint` resolves in a test project that installs Adamantite, inside the package
 * of `makeAdamantitePackageFile`. Without it, the project installs no Adamantite.
 */
export const ADAMANTITE_RESOLUTION = {
  "adamantite/lint": "node_modules/adamantite/dist/presets/lint.js",
} as const

/**
 * The manifest of the installed Adamantite `version`, as a fixture file.
 */
export function makeAdamantitePackageFile(version: string) {
  return {
    "node_modules/adamantite/package.json": JSON.stringify({ name: "adamantite", version }),
  }
}

/**
 * The Adamantite skills in `.agents/skills`, as Setup writes them in a project without Oxfmt.
 */
export const SKILL_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(getShippedSkillFiles()).map(([file, content]) => [
    `.agents/skills/${file}`,
    content,
  ])
)

/**
 * The hash that the lockfile records for `content`.
 */
export function hashContent(content: string): string {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`
}

export interface DependencyInstallerCall {
  readonly options: { readonly workspace: boolean }
  readonly packages: string[]
}

export interface DependencyInstallerTestContext {
  readonly calls: DependencyInstallerCall[]
  readonly layer: Layer.Layer<DependencyInstaller, never, FileSystem.FileSystem | Path.Path>
}

export interface RunnerTestContext {
  readonly invocations: CommandRunOptions[]
  /**
   * Also provides `CodingAgents` backed by this runner, so handoff spawns are recorded.
   */
  readonly layer: Layer.Layer<CodingAgents | CommandRunner>
}

/**
 * The command that runs Oxlint in a test project that installs Oxlint with no plugin and no
 * type-aware backend.
 */
export const OXLINT_COMMAND = {
  args: ["/project/node_modules/oxlint/dist/cli.js"],
  command: "node",
  cwd: "/project",
  env: {},
  name: "oxlint",
} as const

/**
 * The Oxfmt CLI module of a test project that installs Oxfmt. `check` and `fix` start it with
 * Node.js.
 */
export const OXFMT_CLI = "/project/node_modules/oxfmt/dist/cli.js"

/**
 * Finds the packages of `tools` in the test project, so a command that runs Oxlint resolves the
 * runtime of `OXLINT_COMMAND`, and a command that runs Oxfmt starts `OXFMT_CLI`.
 */
export function makeToolsInstalledLayer(...tools: ReadonlyArray<"oxfmt" | "oxlint">) {
  return makeModuleResolverLayer(
    "/project",
    Object.fromEntries(
      tools.map((tool) => [`${tool}/package.json`, `node_modules/${tool}/package.json`])
    )
  )
}

/**
 * Finds the Oxfmt and Oxlint packages of the test project.
 */
export const toolsInstalledLayer = makeToolsInstalledLayer("oxfmt", "oxlint")

// A layer's output type is contravariant, so `never` accepts every layer that does not fail.
// `runCommand` provides the filesystem of the test to each one.
type TestLayer = Layer.Layer<never, never, FileSystem.FileSystem | Path.Path>

export function createRunnerTestContext(
  options:
    | number[]
    | {
        readonly implementation: (
          options: CommandRunOptions
        ) => Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike>
      } = [0]
): RunnerTestContext {
  const remainingExitCodes = Array.isArray(options) ? [...options] : []
  const invocations: CommandRunOptions[] = []
  const implementation = Array.isArray(options) ? undefined : options.implementation

  return {
    invocations,
    layer: CodingAgents.layer.pipe(
      Layer.provideMerge(
        Layer.succeed(
          CommandRunner,
          CommandRunner.make((options) =>
            Effect.gen(function* () {
              invocations.push({
                ...options,
                args: [...options.args],
              })

              if (implementation) {
                return yield* implementation(options)
              }

              return ChildProcessSpawner.ExitCode(remainingExitCodes.shift() ?? 0)
            })
          )
        )
      )
    ),
  }
}

interface HandoffRunnerOptions {
  readonly agentExit?: number | "not-found" | "spawn-error"
  /**
   * Exit codes of the commands that are not coding agents, by their `name` or `command`, such as
   * `oxlint`. Each defaults to 0.
   */
  readonly commandExits?: Readonly<Record<string, number | "not-found">>
  readonly installedCommands?: readonly string[]
  readonly onAgentRun?: () => void
}

function isProbe(invocation: { readonly args: string[] }) {
  return invocation.args[0] === "--version" || invocation.args[0] === "version"
}

// Dispatches on the invocation shape: `--version` probes answer installation, a command outside
// the agent catalog answers from `commandExits`, and everything else is the agent spawn.
export function makeHandoffRunner(options: HandoffRunnerOptions = {}) {
  const installed = options.installedCommands ?? ["claude", "codex"]

  return createRunnerTestContext({
    implementation: (invocation) =>
      Effect.suspend((): Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike> => {
        if (isProbe(invocation)) {
          return installed.includes(invocation.command)
            ? Effect.succeed(ChildProcessSpawner.ExitCode(0))
            : Effect.fail(new CliNotFound({ command: invocation.command }))
        }

        if (!codingAgents.some((agent) => agent.command === invocation.command)) {
          const commandExit = options.commandExits?.[invocation.name ?? invocation.command] ?? 0

          return commandExit === "not-found"
            ? Effect.fail(new CliNotFound({ command: invocation.command }))
            : Effect.succeed(ChildProcessSpawner.ExitCode(commandExit))
        }

        if (options.agentExit === "not-found") {
          return Effect.fail(new CliNotFound({ command: invocation.command }))
        }

        if (options.agentExit === "spawn-error") {
          return Effect.fail(makeSystemError("PermissionDenied", "spawn", invocation.command))
        }

        options.onAgentRun?.()

        return Effect.succeed(ChildProcessSpawner.ExitCode(options.agentExit ?? 0))
      }),
  })
}

export function nonProbeInvocations(runner: RunnerTestContext) {
  return runner.invocations.filter((invocation) => !isProbe(invocation))
}

// The manifest that an install changes. The install keeps every other field as it is.
const InstalledManifest = Schema.fromJsonString(
  Schema.StructWithRest(
    Schema.Struct({
      devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    }),
    [Schema.Record(Schema.String, Schema.Json)]
  ),
  { space: 2 }
)

// As a package manager does, an install declares each package in the manifest of `cwd`.
export const declareDevDependencies = (packages: readonly string[], cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const manifestPath = path.join(cwd, "package.json")

    const manifest = yield* Schema.decodeEffect(InstalledManifest)(
      yield* fs.readFileString(manifestPath)
    )

    const installed = packages.map((specifier) => {
      const at = specifier.lastIndexOf("@")

      return [specifier.slice(0, at), specifier.slice(at + 1)] as const
    })

    const updated = yield* Schema.encodeEffect(InstalledManifest)({
      ...manifest,
      devDependencies: { ...manifest.devDependencies, ...Object.fromEntries(installed) },
    })

    yield* fs.writeFileString(manifestPath, `${updated}\n`)
  }).pipe(Effect.orDie)

export function createDependencyInstallerTestContext(options?: {
  readonly addDevDependenciesError?: FailedToInstallDependency
  readonly detectedPackageManager?: Option.Option<DetectedPackageManager>
}): DependencyInstallerTestContext {
  const calls: DependencyInstallerCall[] = []
  const detectedPackageManager = options?.detectedPackageManager ?? Option.some({ name: "bun" })

  return {
    calls,
    layer: Layer.effect(DependencyInstaller)(
      Effect.gen(function* () {
        const context = yield* Effect.context<FileSystem.FileSystem | Path.Path>()

        return DependencyInstaller.of({
          addDevDependencies: (packages, cwd, installOptions) =>
            Effect.gen(function* () {
              calls.push({
                options: installOptions,
                packages: [...packages],
              })

              if (options?.addDevDependenciesError) {
                return yield* options.addDevDependenciesError
              }

              yield* declareDevDependencies(packages, cwd).pipe(Effect.provideContext(context))
            }),
          detectPackageManager: (_cwd) => Effect.succeed(detectedPackageManager),
        })
      })
    ),
  }
}

/**
 * The capabilities of a terminal that can prompt. Without this layer, commands run as in CI, where
 * `canPrompt` is false. Colors stay off, so the output reads as plain text.
 */
export const promptingLayer = Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
  canAnimate: false,
  canColor: false,
  canPrompt: true,
})

const failingSpawnerLayer = makeOxlintFilesLayer()

// Commands require these services statically even on paths that never use them. Tests that do
// reach them pass their own layer, which takes precedence.
const unexpectedRunnerLayer = Layer.succeed(
  CommandRunner,
  CommandRunner.make((options) =>
    Effect.die(`Unexpected \`${options.command}\` run: pass a runner layer to runCommand`)
  )
)

// No coding agent CLI is on PATH, so the resolution menu offers only the prompt copy.
const noAgentRunnerLayer = Layer.succeed(
  CommandRunner,
  CommandRunner.make((options) =>
    isProbe(options)
      ? Effect.fail(new CliNotFound({ command: options.command }))
      : Effect.die(`Unexpected \`${options.command}\` run: pass a runner layer to runCommand`)
  )
)

const unexpectedInstallerLayer = Layer.succeed(DependencyInstaller)({
  addDevDependencies: () =>
    Effect.die("Unexpected dependency install: pass an installer layer to runCommand"),
  detectPackageManager: () =>
    Effect.die("Unexpected package manager detection: pass an installer layer to runCommand"),
})

export interface RunCommandOptions<Layers extends readonly TestLayer[]> {
  /**
   * Receives each file that the config loader loads, in the order that the loads start.
   */
  readonly configLoads?: string[]
  readonly errorLines?: unknown[]
  readonly files?: FileSystemTestContext
  readonly forwardedArguments?: readonly string[]
  readonly layers?: Layers
  readonly logLines?: unknown[]
  /**
   * The terminal that answers the prompts. The default terminal has no keys, so a prompt fails the
   * test.
   */
  readonly terminal?: TerminalTestContext
}

/**
 * The test filesystem and a `Path` that resolves a relative path from the project root, as the CLI
 * resolves it from the working directory. The command runs in the root, which `Project.Directory`
 * names.
 */
function makePlatformLayer(files: FileSystemTestContext) {
  const path = Layer.effect(Path.Path)(
    Effect.map(Path.Path, (posix) => ({
      ...posix,
      resolve: (...segments: readonly string[]) => posix.resolve(files.root, ...segments),
    }))
  ).pipe(Layer.provide(Path.layer))

  return Layer.mergeAll(files.layer, path)
}

function makeDefaultLayer(files: FileSystemTestContext, terminal: TerminalTestContext) {
  const platformLayer = makePlatformLayer(files)

  return Layer.mergeAll(
    platformLayer,
    NodeVersionResolver.layer.pipe(Layer.provide(platformLayer)),
    makeModuleResolverLayer(files.root),
    // Fresh, so a test that runs two commands reads separate lines for each run.
    Layer.fresh(TestConsole.layer),
    terminal.layer,
    Layer.succeed(Prompt.Theme)(Prompt.makeTheme({ colors: false })),
    Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
      canAnimate: false,
      canColor: false,
      canPrompt: false,
    }),
    Stdio.layerTest({}),
    // UTC, so the date that a command prints depends on the test clock and not on the machine.
    DateTime.layerCurrentZoneOffset(0),
    // Synchronous, so the test clock tracks every step before a prompt. A WebCrypto digest resolves
    // outside the test scheduler, and `TestClock.adjust` would not wait for it.
    NodeCrypto.layerDigest,
    failingSpawnerLayer,
    unexpectedRunnerLayer,
    // Fresh, so this default does not memoize `CodingAgents` ahead of a test's runner layer.
    Layer.fresh(CodingAgents.layer).pipe(Layer.provide(noAgentRunnerLayer)),
    unexpectedInstallerLayer
  )
}

/**
 * Runs a command against the default test services plus the given layers, which take precedence. A
 * service the command needs that neither provides stays in the returned effect's requirements, so
 * `it.effect` rejects the test at compile time.
 *
 * The resolution menu waits before an agent handoff, and the test clock stays paused, so the run
 * moves the clock past that wait. A command that never reaches the handoff finishes as it would
 * without the clock change. The run needs the test clock of `it.effect`, because `TestClock.adjust`
 * fails on the live clock.
 */
export function runCommand<
  Name extends string,
  Input,
  ContextInput,
  E,
  R,
  const Layers extends readonly TestLayer[] = [],
>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  args: readonly string[],
  options: RunCommandOptions<Layers> = {}
) {
  const files = options.files ?? createFileSystemTestContext()

  const platformLayer = makePlatformLayer(files)

  // The config loader reads the files and resolves imports with the services of the test, and
  // records each file that it loads.
  const testLayer = Layer.provideMerge(
    Layer.effect(
      ConfigLoader,
      Effect.map(ConfigLoader, (loader) => ({
        load: (cwd: string, file: string) =>
          Effect.sync(() => options.configLoads?.push(file)).pipe(
            Effect.andThen(loader.load(cwd, file))
          ),
      }))
    ).pipe(Layer.provide(configLoaderLayer)),
    Layer.mergeAll(
      makeDefaultLayer(files, options.terminal ?? createTerminalTestContext()),
      ...(options.layers ?? []).map((layer) => layer.pipe(Layer.provide(platformLayer)))
    )
  )

  return Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      Effect.exit(
        Command.runWith(command, { version: "test" })(args).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              options.errorLines?.push(...(yield* TestConsole.errorLines))
              options.logLines?.push(...(yield* TestConsole.logLines))
            })
          ),
          Effect.provideService(ForwardedArguments, options.forwardedArguments ?? []),
          Effect.provideService(Project.Directory, files.root),
          Effect.provide(testLayer)
        )
      )
    )

    yield* TestClock.adjust(RAW_MODE_RELEASE_WAIT)

    return yield* Fiber.join(fiber)
  })
}

/**
 * The error that a command failed with, or undefined when it succeeded or died.
 */
export function getFailure<E>(exit: Exit.Exit<unknown, E>): E | undefined {
  return Option.getOrUndefined(Exit.findErrorOption(exit))
}

/**
 * The failure of a command that finished its work and exits 1 because findings remain. In a test
 * project, Oxlint has no runtime, so `init` and `update` end with this failure when they set up
 * Oxlint.
 */
export function findingsLeft(command: string): CommandFailed {
  return new CommandFailed({ command, exitCode: ChildProcessSpawner.ExitCode(1) })
}
