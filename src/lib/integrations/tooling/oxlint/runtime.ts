import process from "node:process"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { OxlintPlugin, NativeOverride } from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import { oxlintPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import { NativeRuntimeConflict, PackageNotInstalled } from "#lib/shared/errors.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

/**
 * A file that Oxlint loads. `Stock` lets Oxlint find its own file. `Replaced` gives Oxlint the file
 * at `path` in its place.
 */
export type RuntimePart =
  | { readonly _tag: "Stock" }
  | { readonly _tag: "Replaced"; readonly path: string }

/**
 * The type-aware backend that Oxlint starts. `None` runs Oxlint as it is installed, so it fails
 * only when it runs a type-aware rule. `Tsrs` starts the installed tsrs through its `tsrs-lint`
 * launcher, because Oxlint does not find tsrs by itself. `Replaced` sets the variables of a plugin
 * that replaces the whole backend.
 */
export type RuntimeBackend =
  | { readonly _tag: "None" }
  | { readonly _tag: "Replaced"; readonly env: Readonly<Record<string, string>> }
  | { readonly _tag: "Tsrs"; readonly launcher: string }

/**
 * The variables that make Oxlint start the backend.
 */
export function toBackendEnv(backend: RuntimeBackend) {
  switch (backend._tag) {
    case "None":
      return {}
    case "Replaced":
      return backend.env
    case "Tsrs":
      // Oxlint starts the backend as `<path> headless`, and the `tsrs-lint` bin adds the `--lint`
      // flag of tsrs.
      return { OXLINT_TSGOLINT_PATH: backend.launcher }
  }
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
 * The launchers that package managers write for the `tsrs-lint` bin on Windows, which cannot start
 * the bin script itself: `.cmd` from npm and pnpm, and `.exe` from Bun.
 */
const WINDOWS_LAUNCHERS = ["tsrs-lint.cmd", "tsrs-lint.exe"]

/**
 * The nearest `tsrs-lint` launcher in a `node_modules/.bin` folder from `project` up to the root,
 * as Oxlint looks for its own backend on Windows. A workspace package often uses the launcher of
 * the root installation.
 */
const findWindowsLauncher = Effect.fn("findWindowsLauncher")(function* (project: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const candidates: string[] = []

  for (let folder = project; ; folder = path.dirname(folder)) {
    candidates.push(
      ...WINDOWS_LAUNCHERS.map((name) => path.join(folder, "node_modules", ".bin", name))
    )

    if (path.dirname(folder) === folder) {
      break
    }
  }

  return yield* Effect.findFirst(candidates, (candidate) =>
    fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
  )
})

/**
 * The installed tsrs, or no backend when the project does not install tsrs or when Windows has no
 * launcher for it.
 */
const resolveDefaultBackend = Effect.fn("resolveDefaultBackend")(function* (project: string) {
  const path = yield* Path.Path
  const tsrs = yield* resolvePackageDirectory(project, "tsrs")
  const launcher = Option.isNone(tsrs)
    ? Option.none<string>()
    : process.platform === "win32"
      ? yield* findWindowsLauncher(project)
      : Option.some(path.join(tsrs.value, "bin", "tsrs-lint"))

  return Option.match(launcher, {
    onNone: (): RuntimeBackend => ({ _tag: "None" }),
    onSome: (file): RuntimeBackend => ({ _tag: "Tsrs", launcher: file }),
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

  let binding: RuntimePart = { _tag: "Stock" }
  let backend: RuntimeBackend | undefined
  const owners = new Map<NativeOverride["_tag"], string>()

  for (const plugin of plugins) {
    if (plugin.runtime._tag !== "Native") {
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

      if (override._tag === "Binding") {
        binding = { _tag: "Replaced", path: override.path }
      } else {
        // An override replaces the whole backend, so the default and the native backend variables
        // never mix.
        backend = { _tag: "Replaced", env: override.env }
      }
    }
  }

  return {
    backend: backend ?? (yield* resolveDefaultBackend(project)),
    binding,
    oxlint: oxlint.value,
  } satisfies OxlintRuntime
})
