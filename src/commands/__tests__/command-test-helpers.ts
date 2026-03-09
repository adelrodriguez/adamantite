import type * as prompts from "@clack/prompts"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Terminal from "effect/Terminal"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { FailedToInstallDependency } from "#errors.ts"
import { type CommandRunOptions, CommandRunner } from "#services/command-runner.ts"
import { type DetectedPackageManager, DependencyInstaller } from "#services/dependency-installer.ts"
import { Prompter } from "#services/prompter.ts"

interface LogEntry {
  readonly level: "error" | "info" | "success" | "warning"
  readonly message: string
}

interface SpinnerEntry {
  readonly message?: string
  readonly type: "message" | "start" | "stop"
}

export interface PrompterTestContext {
  readonly confirmCalls: prompts.ConfirmOptions[]
  readonly intros: string[]
  readonly layer: Layer.Layer<Prompter>
  readonly logs: LogEntry[]
  readonly outros: string[]
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

function noop() {
  return null
}

function shiftResponse<T>(queue: T[], kind: string): T {
  const response = queue.shift()

  if (response === undefined) {
    throw new Error(`Missing ${kind} response`)
  }

  return response
}

export function createRunnerTestContext(exitCodes: number[] = [0]): RunnerTestContext {
  const remainingExitCodes = [...exitCodes]
  const invocations: CommandRunOptions[] = []

  return {
    invocations,
    layer: Layer.succeed(CommandRunner)({
      run: (options) =>
        Effect.sync(() => {
          invocations.push({
            ...options,
            args: [...options.args],
          })
          return ChildProcessSpawner.ExitCode(remainingExitCodes.shift() ?? 0)
        }),
    }),
  }
}

export function createPrompterTestContext(options?: {
  readonly confirmResponses?: boolean[]
  readonly multiselectResponses?: unknown[][]
}): PrompterTestContext {
  const confirmResponses = [...(options?.confirmResponses ?? [])]
  const multiselectResponses = [...(options?.multiselectResponses ?? [])]
  const confirmCalls: prompts.ConfirmOptions[] = []
  const intros: string[] = []
  const logs: LogEntry[] = []
  const outros: string[] = []
  const spinnerEntries: SpinnerEntry[] = []

  return {
    confirmCalls,
    intros,
    layer: Layer.succeed(Prompter)({
      cancel: (message) =>
        Effect.sync(() => {
          logs.push({ level: "warning", message })
        }),
      confirm: (config) =>
        Effect.sync(() => {
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
      multiselect: <T>(_config: prompts.MultiSelectOptions<T>) =>
        Effect.sync(() => shiftResponse(multiselectResponses, "multiselect") as T[]),
      outro: (message) =>
        Effect.sync(() => {
          outros.push(message)
        }),
      spinner: () =>
        ({
          cancel: () => false,
          clear: () => null,
          error: () => false,
          isCancelled: false,
          message: (message: string) => {
            spinnerEntries.push({ message, type: "message" })
          },
          start: (message?: string) => {
            spinnerEntries.push({ message, type: "start" })
          },
          stop: (message?: string) => {
            spinnerEntries.push({ message, type: "stop" })
          },
        }) as ReturnType<typeof prompts.spinner>,
    }),
    logs,
    outros,
    spinnerEntries,
  }
}

export function createDependencyInstallerTestContext(options?: {
  readonly addDevDependenciesError?: FailedToInstallDependency
  readonly detectedPackageManager?: DetectedPackageManager | null
}): DependencyInstallerTestContext {
  const calls: DependencyInstallerCall[] = []

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
            return yield* Effect.fail(options.addDevDependenciesError)
          }
        }),
      detectPackageManager: (_cwd) =>
        Effect.succeed(options?.detectedPackageManager ?? { name: "bun" }),
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
    })
  )
}

function makeQuietConsoleLayer() {
  return Layer.succeed(Console.Console)({
    assert: noop,
    clear: noop,
    count: noop,
    countReset: noop,
    debug: noop,
    dir: noop,
    dirxml: noop,
    error: noop,
    group: noop,
    groupCollapsed: noop,
    groupEnd: noop,
    info: noop,
    log: noop,
    table: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    trace: noop,
    warn: noop,
  })
}

export async function runCommand(
  command: Command.Command.Any,
  args: string[],
  layers: TestLayer[]
) {
  let providedLayer = Layer.mergeAll(
    NodeServices.layer,
    makeQuietConsoleLayer(),
    makeQuietTerminalLayer()
  ) as TestLayer

  for (const layer of layers) {
    providedLayer = Layer.merge(providedLayer, layer) as TestLayer
  }

  return Effect.runPromiseExit(
    Command.runWith(command, { version: "test" })(args).pipe(
      Effect.provide(providedLayer)
    ) as Effect.Effect<void, unknown>
  )
}

export async function runCommandWithRunner(
  command: Command.Command.Any,
  args: string[],
  runner: RunnerTestContext
) {
  return Effect.runPromiseExit(
    Command.runWith(command, { version: "test" })(args).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, runner.layer))
    ) as Effect.Effect<void, unknown>
  )
}
