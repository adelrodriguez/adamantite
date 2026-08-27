import type * as prompts from "@clack/prompts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Stdio from "effect/Stdio"
import * as Terminal from "effect/Terminal"
import { TestConsole } from "effect/testing"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { type FailedToInstallDependency, OperationCancelled } from "#lib/shared/errors.ts"
import {
  type DetectedPackageManager,
  DependencyInstaller,
} from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

interface LogEntry {
  readonly level: "error" | "info" | "success" | "warning"
  readonly message: string
}

interface SpinnerEntry {
  readonly message?: string
  readonly type: "message" | "start" | "stop"
}

export interface PrompterTestContext {
  readonly cancels: string[]
  readonly confirmCalls: prompts.ConfirmOptions[]
  readonly intros: string[]
  readonly layer: Layer.Layer<Prompter>
  readonly logs: LogEntry[]
  readonly messages: string[]
  readonly multiselectCalls: unknown[]
  readonly notes: Array<{ readonly message: string; readonly title: string }>
  readonly outros: string[]
  readonly selectCalls: unknown[]
  readonly spinnerEntries: SpinnerEntry[]
}

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
  readonly layer: Layer.Layer<CommandRunner>
}

type TestLayer = Layer.Layer<never, unknown, unknown>

function shiftResponse<T>(queue: T[], kind: string): T {
  const response = queue.shift()

  if (response === undefined) {
    throw new Error(`Missing ${kind} response`)
  }

  return response
}

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
    layer: Layer.succeed(CommandRunner)({
      run: (options) =>
        Effect.gen(function* () {
          invocations.push({
            ...options,
            args: [...options.args],
          })
          if (implementation) {
            return yield* implementation(options)
          }
          return ChildProcessSpawner.ExitCode(remainingExitCodes.shift() ?? 0)
        }),
    }),
  }
}

export function createPrompterTestContext(options?: {
  readonly cancelAtPromptIndex?: number
  readonly confirmResponses?: boolean[]
  readonly multiselectResponses?: unknown[][]
  readonly selectResponses?: unknown[]
}): PrompterTestContext {
  const cancelAtPromptIndex = options?.cancelAtPromptIndex
  const confirmResponses = [...(options?.confirmResponses ?? [])]
  const multiselectResponses = [...(options?.multiselectResponses ?? [])]
  const selectResponses = [...(options?.selectResponses ?? [])]
  const cancels: string[] = []
  const confirmCalls: prompts.ConfirmOptions[] = []
  const intros: string[] = []
  const logs: LogEntry[] = []
  const messages: string[] = []
  const multiselectCalls: unknown[] = []
  const notes: Array<{ readonly message: string; readonly title: string }> = []
  const outros: string[] = []
  const selectCalls: unknown[] = []
  const spinnerEntries: SpinnerEntry[] = []
  let promptIndex = 0

  // CancelAtPromptIndex is 1-based: 1 means cancel the first prompt shown.
  function shouldCancelPrompt() {
    promptIndex += 1
    return cancelAtPromptIndex === promptIndex
  }

  return {
    cancels,
    confirmCalls,
    intros,
    layer: Layer.succeed(Prompter)({
      cancel: (message) =>
        Effect.sync(() => {
          cancels.push(message)
          logs.push({ level: "warning", message })
        }),
      confirm: (config) =>
        Effect.gen(function* () {
          if (shouldCancelPrompt()) {
            return yield* new OperationCancelled({})
          }

          confirmCalls.push(config)
          return shiftResponse(confirmResponses, "confirm")
        }),
      intro: (message) =>
        Effect.sync(() => {
          intros.push(message)
        }),
      log: {
        error: (message) =>
          Effect.sync(() => {
            logs.push({ level: "error", message })
          }),
        info: (message) =>
          Effect.sync(() => {
            logs.push({ level: "info", message })
          }),
        success: (message) =>
          Effect.sync(() => {
            logs.push({ level: "success", message })
          }),
        warning: (message) =>
          Effect.sync(() => {
            logs.push({ level: "warning", message })
          }),
      },
      message: (message) =>
        Effect.sync(() => {
          messages.push(message)
        }),
      multiselect: <T>(config: prompts.MultiSelectOptions<T>) =>
        Effect.gen(function* () {
          if (shouldCancelPrompt()) {
            return yield* new OperationCancelled({})
          }

          multiselectCalls.push(config)
          // SAFETY: each test queues multiselect responses matching the option type of the prompt it triggers.
          return shiftResponse(multiselectResponses, "multiselect") as T[]
        }),
      note: (message, title) =>
        Effect.sync(() => {
          notes.push({ message, title })
        }),
      outro: (message) =>
        Effect.sync(() => {
          outros.push(message)
        }),
      select: <T>(config: prompts.SelectOptions<T>) =>
        Effect.gen(function* () {
          if (shouldCancelPrompt()) {
            return yield* new OperationCancelled({})
          }

          selectCalls.push(config)
          // SAFETY: each test queues a select response that matches the option type of the prompt.
          return shiftResponse(selectResponses, "select") as T
        }),
      withSpinner: (run, spinnerOptions) =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            spinnerEntries.push({ message: spinnerOptions.start, type: "start" })
          }),
          () =>
            run({
              message: (message) =>
                Effect.sync(() => {
                  spinnerEntries.push({ message, type: "message" })
                }),
            }),
          (_, exit) =>
            Effect.sync(() => {
              spinnerEntries.push({
                message: Exit.match(exit, {
                  onFailure: () => spinnerOptions.failure,
                  onSuccess: (value) =>
                    Predicate.isFunction(spinnerOptions.success)
                      ? spinnerOptions.success(value)
                      : spinnerOptions.success,
                }),
                type: "stop",
              })
            })
        ),
    }),
    logs,
    messages,
    multiselectCalls,
    notes,
    outros,
    selectCalls,
    spinnerEntries,
  }
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

function makeQuietTerminalLayer() {
  return Layer.succeed(Terminal.Terminal)(
    Terminal.make({
      columns: Effect.succeed(40),
      display: () => Effect.void,
      readInput: Effect.never,
      readLine: Effect.never,
      rows: Effect.succeed(24),
    })
  )
}

const failingSpawnerLayer = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
  ChildProcessSpawner.make(() =>
    Effect.die("Command tests must stub CommandRunner instead of spawning processes")
  )
)

export interface RunCommandOptions {
  readonly files?: FileSystemTestContext
  readonly forwardedArguments?: readonly string[]
  readonly layers?: TestLayer[]
}

export function runCommand(
  command: Command.Command.Any,
  args: readonly string[],
  options: RunCommandOptions = {}
) {
  const files = options.files ?? createFileSystemTestContext()
  const platformLayer = Layer.mergeAll(files.layer, Path.layer)

  // SAFETY: Layer's type parameters are invariant, so accumulating heterogeneous
  // per-test layers in the merge loop below requires widening to TestLayer.
  let providedLayer = Layer.mergeAll(
    platformLayer,
    NodeVersionResolver.layer.pipe(Layer.provide(platformLayer)),
    TestConsole.layer,
    makeQuietTerminalLayer(),
    Stdio.layerTest({}),
    Layer.succeed(TerminalCapabilities)({
      copyToClipboard: () => Effect.void,
      isInteractive: Effect.succeed(false),
    }),
    failingSpawnerLayer
  ) as TestLayer

  for (const layer of options.layers ?? []) {
    providedLayer = Layer.merge(providedLayer, layer)
  }

  return Effect.exit(
    // SAFETY: TestLayer erases its outputs to unknown, so providing it cannot
    // discharge the requirement channel statically; the merged layers supply
    // every service the command uses at runtime.
    Command.runWith(command, { version: "test" })(args).pipe(
      Effect.provideService(ForwardedArguments, options.forwardedArguments ?? []),
      Effect.provide(providedLayer)
    ) as Effect.Effect<void, unknown>
  )
}
