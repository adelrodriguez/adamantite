import process from "node:process"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  BindingOverride,
  type NativeOverride,
  NativeRuntime,
  type OxlintPlugin,
} from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import { oxlintPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import { NativeRuntimeConflict, PackageNotInstalled } from "#lib/shared/errors.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

/**
 * Oxlint finds its own file.
 */
export class StockPart extends Data.TaggedClass("Stock") {}

/**
 * Oxlint loads the file at `path` in place of its own file.
 */
export class ReplacedPart extends Data.TaggedClass("Replaced")<{ readonly path: string }> {}

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
export type RuntimeBackend = NoBackend | ReplacedBackend | TsrsBackend

/**
 * The variables that make Oxlint start the backend on `platform`.
 */
export function toBackendEnv(backend: RuntimeBackend, platform = process.platform) {
  return Match.valueTags(backend, {
    None: () => ({}),
    Replaced: ({ env }) => env,
    // Oxlint 1.92 and later find the launcher with the same search as `findLauncher`, and start it
    // as `<path> headless`. Only when that search finds nothing does Oxlint also look on `PATH`.
    // The `tsrs-lint` bin adds the `--lint` flag of tsrs. Windows still names the launcher, because
    // no Windows run has confirmed that search. See ADR 0021.
    Tsrs: ({ launcher }) => (platform === "win32" ? { OXLINT_TSGOLINT_PATH: launcher } : {}),
  })
}

/**
 * What runs Oxlint for one project: the Oxlint package, its native binding, and its type-aware
 * backend.
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
 * The Oxlint runtime for the project at `project`. Each Oxlint plugin with a native capability can
 * replace the binding or the backend when the project installs it. Two plugins that replace the
 * same part fail. Without a backend override, Oxlint starts the installed tsrs. The resolution
 * reads files, but it loads no Oxlint module and changes no process variable.
 */
export const resolveOxlintRuntime = Effect.fn("resolveOxlintRuntime")(function* (
  project: string,
  plugins: readonly OxlintPlugin[] = oxlintPlugins
) {
  const oxlint = yield* resolvePackageDirectory(project, "oxlint")

  if (Option.isNone(oxlint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint", project })
  }

  let binding: RuntimePart = new StockPart()
  let backend: RuntimeBackend | undefined
  const owners = new Map<NativeOverride["_tag"], string>()

  for (const plugin of plugins) {
    if (!(plugin.runtime instanceof NativeRuntime)) {
      continue
    }

    const overrides = yield* plugin.runtime.resolve(project, oxlint.value)

    for (const override of overrides) {
      const owner = owners.get(override._tag)

      if (owner !== undefined) {
        return yield* new NativeRuntimeConflict({
          part: override._tag,
          plugins: [owner, plugin.name],
        })
      }

      owners.set(override._tag, plugin.name)

      if (override instanceof BindingOverride) {
        binding = new ReplacedPart({ path: override.path })
      } else {
        // An override replaces the whole backend, so the default and the native backend variables
        // never mix.
        backend = new ReplacedBackend({ env: override.env })
      }
    }
  }

  return {
    backend: backend ?? (yield* resolveDefaultBackend(project)),
    binding,
    oxlint: oxlint.value,
  } satisfies OxlintRuntime
})
