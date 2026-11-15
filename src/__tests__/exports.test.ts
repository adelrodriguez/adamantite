import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import { LEGACY_CUSTOM_RULES_MODULE } from "#lib/project/custom-rules/inspect.ts"
import { PRESET, type PresetIdentity } from "#presets/identity.ts"
import packageJson from "../../package.json" with { type: "json" }
import readme from "../../README.md?raw"

const exportedImports = Object.keys(packageJson.exports).map(
  (subpath) => `adamantite${subpath.slice(1)}`
)

/**
 * The imports in the README table of public imports, such as `adamantite/rules/plugin`.
 */
function readDocumentedImports() {
  return readme
    .split("\n")
    .flatMap((line) => /^\| `(adamantite(?:\/[\w-]+)*)`/.exec(line)?.[1] ?? [])
}

describe("package exports", () => {
  it("publish exactly the imports in the README table", () => {
    expect(Array.sort(readDocumentedImports(), Order.String)).toStrictEqual(
      Array.sort(exportedImports, Order.String)
    )
  })

  // Doctor reads a loaded config, so it finds a preset by the module that the preset names.
  it.effect.each(
    Object.entries(packageJson.exports).flatMap(([subpath, target]) => {
      const built = Predicate.isString(target) ? target : target.default
      const source = /^\.\/dist\/(presets\/(?:analyze|format|lint\/[\w-]+))\.js$/u.exec(built)?.[1]

      return source === undefined ? [] : [{ module: `adamantite${subpath.slice(1)}`, source }]
    })
  )("name $module under the preset key", ({ module, source }) =>
    Effect.promise(() => import(new URL(`../../${source}.ts`, import.meta.url).href)).pipe(
      Effect.map((loaded: { readonly default: { readonly [key: symbol]: PresetIdentity } }) => {
        expect(loaded.default[PRESET]).toStrictEqual({ module })
      })
    )
  )

  it("keep the removed custom rules import private, so Doctor can ask projects to migrate", () => {
    expect(exportedImports).not.toContain(LEGACY_CUSTOM_RULES_MODULE)
  })
})
