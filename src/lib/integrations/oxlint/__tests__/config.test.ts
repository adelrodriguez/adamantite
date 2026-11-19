import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import {
  findMisplacedCorePreset,
  inspectRequiredOxlintConfig,
  listLintPresets,
  toOxlintTsConfigContent,
} from "#lib/integrations/oxlint/config.ts"
import { readLintConfig } from "#lib/project/lint-config.ts"
import { LINT_PRESETS } from "#lib/project/selection.ts"

const ROOT = "/project"

function loadConfig(content: string) {
  const files = createFileSystemTestContext({ files: { "oxlint.config.ts": content }, root: ROOT })

  return readLintConfig(ROOT, `${ROOT}/oxlint.config.ts`).pipe(
    Effect.map((loaded) => loaded.pipe(Option.flatMap(Result.getSuccess), Option.getOrThrow)),
    Effect.provide(withConfigLoader(Layer.mergeAll(files.layer, makeModuleResolverLayer(ROOT))))
  )
}

describe("toOxlintTsConfigContent", () => {
  it.effect("write a config that applies each preset in order, with the required options", () =>
    Effect.gen(function* () {
      const config = yield* loadConfig(toOxlintTsConfigContent(LINT_PRESETS))

      expect({
        inspection: inspectRequiredOxlintConfig(config),
        misplaced: findMisplacedCorePreset(config),
        presets: listLintPresets(config),
      }).toStrictEqual({
        inspection: { kind: "configured" },
        misplaced: Option.none(),
        presets: [...LINT_PRESETS],
      })
    })
  )
})
