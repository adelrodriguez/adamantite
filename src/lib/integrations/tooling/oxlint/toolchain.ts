import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
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
  readonly backend: ToolchainPart
  readonly binding: ToolchainPart
  /**
   * The folder of the Oxlint package that the project installs.
   */
  readonly oxlint: string
}

const STOCK: ToolchainPart = { _tag: "Stock" }

/**
 * The toolchain for the project at `project`. A project that installs `@effect/tsgo` gets the
 * Effect builds of the binding and the backend, so Oxlint can load the `effecttsgo` rules. Every
 * other project runs Oxlint as it is installed.
 */
export const resolveToolchain = Effect.fn("resolveToolchain")(function* (project: string) {
  const oxlint = yield* resolvePackageDirectory(project, "oxlint")

  if (Option.isNone(oxlint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint", project })
  }

  const effect = yield* resolveEffectToolchain(project, oxlint.value)

  return Option.match(effect, {
    onNone: (): Toolchain => ({ backend: STOCK, binding: STOCK, oxlint: oxlint.value }),
    onSome: ({ backend, binding }): Toolchain => ({
      backend: { _tag: "Replaced", path: backend },
      binding: { _tag: "Replaced", path: binding },
      oxlint: oxlint.value,
    }),
  })
})
