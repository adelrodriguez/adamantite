import process from "node:process"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { resolveEffectToolchain } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/toolchain.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

/**
 * A file that Oxlint loads. `Stock` lets Oxlint find its own file. `Replaced` gives Oxlint the file
 * at `path` in its place.
 */
export type ToolchainPart =
  | { readonly _tag: "Stock" }
  | { readonly _tag: "Replaced"; readonly path: string }

/**
 * What runs Oxlint for one project: the Oxlint package, its native binding, and its type-aware
 * backend.
 */
export interface Toolchain {
  /**
   * The variables that make Oxlint start tsrs as its type-aware backend. Oxlint does not find tsrs
   * by itself. None when the project does not install tsrs, or when Windows has no launcher for
   * it.
   */
  readonly backend: Readonly<Record<string, string>>
  readonly binding: ToolchainPart
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
 * The toolchain for the project at `project`. A project that installs `@effect/tsgo` gets the
 * Effect builds of the binding and tsrs, so Oxlint can load the `effecttsgo` rules. Every other
 * project runs the installed Oxlint with the installed tsrs. Without tsrs, Oxlint runs as it is
 * installed, and fails only when it runs a type-aware rule. Doctor reports the missing package.
 */
export const resolveToolchain = Effect.fn("resolveToolchain")(function* (project: string) {
  const path = yield* Path.Path
  const oxlint = yield* resolvePackageDirectory(project, "oxlint")

  if (Option.isNone(oxlint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint", project })
  }

  const effect = yield* resolveEffectToolchain(project, oxlint.value)

  if (Option.isSome(effect)) {
    return {
      backend: effect.value.backend,
      binding: { _tag: "Replaced", path: effect.value.binding },
      oxlint: oxlint.value,
    } satisfies Toolchain
  }

  const tsrs = yield* resolvePackageDirectory(project, "tsrs")
  // Oxlint starts the backend as `<path> headless`, and the `tsrs-lint` bin adds the `--lint` flag
  // of tsrs.
  const launcher = Option.isNone(tsrs)
    ? Option.none<string>()
    : process.platform === "win32"
      ? yield* findWindowsLauncher(project)
      : Option.some(path.join(tsrs.value, "bin", "tsrs-lint"))
  const backend = Option.match(launcher, {
    onNone: () => ({}),
    onSome: (file) => ({ OXLINT_TSGOLINT_PATH: file }),
  })

  return { backend, binding: { _tag: "Stock" }, oxlint: oxlint.value } satisfies Toolchain
})
