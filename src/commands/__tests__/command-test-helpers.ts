import { createHash } from "node:crypto"
import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import { TestConsole } from "effect/testing"
import type { DetectedPackageManager } from "#lib/project/package-manager.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  type FileSystemTestContext,
  createFileSystemTestContext,
  makeSystemError,
} from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import { createTerminalTestContext, type TerminalTestContext } from "#__tests__/terminal.ts"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/handoff/coding-agents.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { LOCKFILE_PATH, Lockfile } from "#lib/project/lockfile.ts"
import { NodeVersionResolver } from "#lib/project/node-version-resolver.ts"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/shared/command-runner.ts"
import { CliNotFound, CommandFailed, type FailedToInstallDependency } from "#lib/shared/errors.ts"
import { ForwardedArguments } from "#lib/shared/forwarded-arguments.ts"

const LockfileJson = Schema.fromJsonString(Lockfile)

/**
 * The lockfile that a command wrote, decoded.
 */
export function readLockfile(files: FileSystemTestContext): Lockfile {
  return Schema.decodeSync(LockfileJson)(files.read(LOCKFILE_PATH))
}

/**
 * A lockfile with `selection` and the hashes of `written`, as a fixture file.
 */
export function makeLockfileFile(
  selection: Selection,
  written: Readonly<Record<string, string>> = {}
) {
  return {
    [LOCKFILE_PATH]: Schema.encodeSync(LockfileJson)({
      schemaVersion: 1,
      selection,
      version: "0.0.0",
      written,
    }),
  }
}

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

// A layer's output type is contravariant, so `never` accepts every layer that does not fail.
// `runCommand` provides the filesystem of the test to each one.
type TestLayer = Layer.Layer<never, never, FileSystem.FileSystem | Path.Path>

export function createRunnerTestContext(
  options:
    | number[]
    | {
        readonly exitCodes?: number[]
        readonly implementation?: (
          options: CommandRunOptions
        ) => Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike>
      } = [0]
): RunnerTestContext {
  const remainingExitCodes = [...(Array.isArray(options) ? options : (options.exitCodes ?? [0]))]
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

// Drawn from the shipped catalog so a changed seed or probe form fails these tests.
export function agentByCommand(command: string): CodingAgent {
  const agent = codingAgents.find((candidate) => candidate.command === command)

  if (!agent) {
    throw new Error(`No coding agent in the catalog with command \`${command}\``)
  }

  return agent
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
const declareDevDependencies = (packages: readonly string[], cwd: string) =>
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

export interface PackageManagerTestContext {
  /**
   * Each command line that the package manager ran, such as `pnpm add -D oxlint@1.0.0`.
   */
  readonly commandLines: string[]
  readonly layer: Layer.Layer<DependencyInstaller, never, FileSystem.FileSystem | Path.Path>
}

/**
 * The live `DependencyInstaller`, which detects the package manager from the test filesystem, with
 * a package manager that records each command line and declares the packages it adds. With
 * `failure`, the package manager prints its `stderr` and exits 1 instead.
 */
export function createPackageManagerTestContext(options?: {
  readonly failure?: { readonly stderr: string }
}): PackageManagerTestContext {
  const commandLines: string[] = []

  const spawnerLayer = Layer.effect(ChildProcessSpawner.ChildProcessSpawner)(
    Effect.gen(function* () {
      const context = yield* Effect.context<FileSystem.FileSystem | Path.Path>()

      return ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            return yield* Effect.die("A package manager install runs one command")
          }

          const args = command.args.map(String)
          commandLines.push([command.command, ...args].join(" "))

          const packages = args
            .slice(args.indexOf("-D") + 1)
            .map((specifier) => specifier.replace(/^npm:/, ""))

          if (options?.failure === undefined) {
            yield* declareDevDependencies(packages, command.options.cwd ?? "/").pipe(
              Effect.provideContext(context)
            )
          }

          return ChildProcessSpawner.makeHandle({
            all: Stream.empty,
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(options?.failure ? 1 : 0)),
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            pid: ChildProcessSpawner.ProcessId(1),
            stderr: Stream.make(new TextEncoder().encode(options?.failure?.stderr ?? "")),
            stdin: Sink.drain,
            stdout: Stream.empty,
            unref: Effect.succeed(Effect.void),
          })
        })
      )
    })
  )

  return {
    commandLines,
    layer: DependencyInstaller.layer.pipe(Layer.provide(spawnerLayer)),
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

function makeDefaultLayer(files: FileSystemTestContext, terminal: TerminalTestContext) {
  const platformLayer = Layer.mergeAll(files.layer, Path.layer)

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
    Digest.layerWebCrypto,
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

  const platformLayer = Layer.mergeAll(files.layer, Path.layer)

  const testLayer = Layer.mergeAll(
    makeDefaultLayer(files, options.terminal ?? createTerminalTestContext()),
    ...(options.layers ?? []).map((layer) => layer.pipe(Layer.provide(platformLayer)))
  )

  return Effect.exit(
    Command.runWith(command, { version: "test" })(args).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          options.errorLines?.push(...(yield* TestConsole.errorLines))
          options.logLines?.push(...(yield* TestConsole.logLines))
        })
      ),
      Effect.provideService(ForwardedArguments, options.forwardedArguments ?? []),
      Effect.provide(testLayer)
    )
  )
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
