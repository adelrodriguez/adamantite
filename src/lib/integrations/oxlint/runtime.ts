import process from "node:process"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  BackendOverride,
  BindingOverride,
  NativeRuntime,
} from "#lib/integrations/oxlint/plugins/base.ts"
import { oxlintPlugins } from "#lib/integrations/oxlint/plugins/index.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"

/**
 * Oxlint finds its own file.
 */
export class StockPart extends Data.TaggedClass("Stock") {}

/**
 * Oxlint loads a plugin's build in place of its own file, after the entry sets `env` and loads the
 * `preload` module that swaps the file.
 */
export class ReplacedPart extends Data.TaggedClass("Replaced")<{
  readonly env: Readonly<Record<string, string>>
  readonly preload: string
}> {}

/**
 * A file that Oxlint loads.
 */
export type RuntimePart = StockPart | ReplacedPart

/**
 * Oxlint runs as it is installed, so it fails only when it runs a type-aware rule.
 */
export class NoBackend extends Data.TaggedClass("None") {}

/**
 * Oxlint starts the installed tsrs through the `tsrs-lint` launcher at `launcher`.
 */
export class TsrsBackend extends Data.TaggedClass("Tsrs")<{ readonly launcher: string }> {}

/**
 * Oxlint starts the backend of a plugin that replaces the whole backend, with the plugin's
 * variables.
 */
export class ReplacedBackend extends Data.TaggedClass("Replaced")<{
  readonly env: Readonly<Record<string, string>>
}> {}

/**
 * The type-aware backend that Oxlint starts.
 */
type RuntimeBackend = NoBackend | ReplacedBackend | TsrsBackend

/**
 * The variables that make Oxlint start the backend on `platform`. A variable without a value is
 * removed from the environment.
 */
export function toBackendEnv(
  backend: RuntimeBackend,
  platform = process.platform
): Readonly<Record<string, string | undefined>> {
  return Match.valueTags(backend, {
    None: () => ({}),
    Replaced: ({ env }) => env,
    // Oxlint 1.92 and later find the launcher with the same search as `findLauncher`, and start it
    // as `<path> headless`. Only when that search finds nothing does Oxlint also look on `PATH`.
    // The `tsrs-lint` bin adds the `--lint` flag of tsrs. Windows still names the launcher, because
    // no Windows run has confirmed that search. Elsewhere, the tsrs backend owns the variable, so an
    // inherited path, such as one to an old tsgolint, must not win over that search.
    Tsrs: ({ launcher }) => ({
      OXLINT_TSGOLINT_PATH: platform === "win32" ? launcher : undefined,
    }),
  })
}

/**
 * What runs Oxlint for one project: the Oxlint package, its native binding, and its type-aware
 * backend. The resolver sets no variable and loads no Oxlint module: a process starts Oxlint from
 * the `OxlintLaunch` that `toLaunch` gives. Doctor reports what the same resolver finds, in
 * `runtime-assessment.ts`.
 */
export interface OxlintRuntime {
  readonly backend: RuntimeBackend
  readonly binding: RuntimePart
  /**
   * The folder of the Oxlint package that the project installs.
   */
  readonly oxlint: string
}

/**
 * How a process starts Oxlint with a runtime: the variables to set, or to remove when a value is
 * undefined, the module to load before Oxlint, and the CLI module of Oxlint.
 */
export interface OxlintLaunch {
  readonly cli: string
  readonly env: Readonly<Record<string, string | undefined>>
  /**
   * The preload module of a plugin, which swaps the stock binding for the plugin's build when
   * Oxlint loads it.
   */
  readonly preload: Option.Option<string>
}

/**
 * How a process starts Oxlint with `runtime` on `platform`.
 */
export const toLaunch = Effect.fn("toLaunch")(function* (
  { backend, binding, oxlint }: OxlintRuntime,
  platform: NodeJS.Platform = process.platform
) {
  const path = yield* Path.Path
  const cli = path.join(oxlint, "dist", "cli.js")
  const backendEnv = toBackendEnv(backend, platform)

  return Match.valueTags(binding, {
    Replaced: ({ env, preload }) => ({
      cli,
      env: { ...backendEnv, ...env },
      preload: Option.some(preload),
    }),
    Stock: () => ({ cli, env: backendEnv, preload: Option.none<string>() }),
  }) satisfies OxlintLaunch
})

/**
 * The nearest `tsrs-lint` launcher in a `node_modules/.bin` folder from `project` up to the root,
 * as Oxlint looks for its backend. A workspace package often uses the launcher of the root
 * installation. Oxlint then also looks on `PATH`, but the project must install its own backend, so
 * a launcher on `PATH` does not count.
 */
const findLauncher = Effect.fn("findLauncher")(function* (project: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  // The launchers that package managers write for the `tsrs-lint` bin. Windows cannot start the bin
  // script itself, so it gets `.cmd` from npm and pnpm, and `.exe` from Bun.
  const launchers =
    process.platform === "win32" ? ["tsrs-lint.cmd", "tsrs-lint.exe"] : ["tsrs-lint"]

  const candidates: string[] = []

  for (let folder = project; ; folder = path.dirname(folder)) {
    candidates.push(...launchers.map((name) => path.join(folder, "node_modules", ".bin", name)))

    if (path.dirname(folder) === folder) {
      break
    }
  }

  return yield* Effect.findFirst(candidates, (candidate) =>
    fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
  )
})

/**
 * The installed tsrs, or no backend when no `node_modules/.bin` folder has a launcher for it.
 */
const resolveDefaultBackend = Effect.fn("resolveDefaultBackend")(function* (project: string) {
  return Option.match(yield* findLauncher(project), {
    onNone: (): RuntimeBackend => new NoBackend(),
    onSome: (file): RuntimeBackend => new TsrsBackend({ launcher: file }),
  })
})

/**
 * The Oxlint runtime for the project at `project`. An Oxlint plugin with a native capability can
 * replace the binding or the backend when the project installs it. Only one plugin has one, so no
 * two overrides replace the same part. Without a backend override, Oxlint starts the installed
 * tsrs. The resolution reads files, but it loads no Oxlint module and changes no process variable.
 */
export const resolveOxlintRuntime = Effect.fn("resolveOxlintRuntime")(function* (project: string) {
  const oxlint = yield* resolvePackageDirectory(project, "oxlint")

  if (Option.isNone(oxlint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint", project })
  }

  const overrides = yield* Effect.forEach(
    oxlintPlugins.flatMap(({ runtime }) => (runtime instanceof NativeRuntime ? [runtime] : [])),
    (runtime) => runtime.resolve(project, oxlint.value),
    { concurrency: "unbounded" }
  )

  const binding = overrides.flat().find((override) => override instanceof BindingOverride)
  const backend = overrides.flat().find((override) => override instanceof BackendOverride)

  return {
    // An override replaces the whole backend, so the default and the native backend variables never
    // mix.
    backend:
      backend === undefined
        ? yield* resolveDefaultBackend(project)
        : new ReplacedBackend({ env: backend.env }),
    binding:
      binding === undefined
        ? new StockPart()
        : new ReplacedPart({ env: binding.env, preload: binding.preload }),
    oxlint: oxlint.value,
  } satisfies OxlintRuntime
})
