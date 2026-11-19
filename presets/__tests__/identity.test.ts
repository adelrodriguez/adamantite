import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import { PRESET, type PresetIdentity } from "#presets/identity.ts"
import packageJson from "../../package.json" with { type: "json" }

describe("preset identity", () => {
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
})
