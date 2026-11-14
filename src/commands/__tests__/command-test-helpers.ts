import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stdio from "effect/Stdio"
import { TestConsole } from "effect/testing"
import {
  type FileSystemTestContext,
  createFileSystemTestContext,
  makeSystemError,
} from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import { createTerminalTestContext, type TerminalTestContext } from "#__tests__/terminal.ts"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { CliNotFound, type FailedToInstallDependency } from "#lib/shared/errors.ts"
import {
  type DetectedPackageManager,
  DependencyInstaller,
} from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

export interface DependencyInstallerCall {
  readonly options?: {
    readonly silent?: boolean
    readonly workspace?: boolean
  }
  readonly packages: string[]
}

export interface DependencyInstallerTestContext {
  readonly calls: DependencyInstallerCall[]
  readonly layer: Layer.Layer<DependencyInstaller>
}

export interface RunnerTestContext {
  readonly invocations: CommandRunOptions[]
  /**
   * Also provides `CodingAgents` backed by this runner, so handoff spawns are recorded.
   */
  readonly layer: Layer.Layer<CodingAgents | CommandRunner>
}

// A layer's output type is contravariant, so `never` accepts every layer that neither fails nor
// requires other services.
type TestLayer = Layer.Layer<never>

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

export function createDependencyInstallerTestContext(options?: {
  readonly addDevDependenciesError?: FailedToInstallDependency
  readonly detectedPackageManager?: DetectedPackageManager | null
}): DependencyInstallerTestContext {
  const calls: DependencyInstallerCall[] = []

  const detectedPackageManager: DetectedPackageManager | null =
    options && "detectedPackageManager" in options
      ? (options.detectedPackageManager ?? null)
      : { name: "bun" as const }

  return {
    calls,
    layer: Layer.succeed(DependencyInstaller)({
      addDevDependencies: (packages, _cwd, installOptions) =>
        Effect.gen(function* () {
          calls.push({
            options: installOptions,
            packages: [...packages],
          })

          if (options?.addDevDependenciesError) {
            return yield* options.addDevDependenciesError
          }
        }),
      detectPackageManager: (_cwd) => Effect.succeed(detectedPackageManager),
    }),
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
    failingSpawnerLayer,
    unexpectedRunnerLayer,
    // Fresh, so this default does not memoize `CodingAgents` ahead of a test's runner layer.
    Layer.fresh(CodingAgents.layer).pipe(Layer.provide(unexpectedRunnerLayer)),
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

  const testLayer = Layer.mergeAll(
    makeDefaultLayer(files, options.terminal ?? createTerminalTestContext()),
    ...(options.layers ?? [])
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
