import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import {
  checkAppliesLintPreset,
  findMisplacedCorePreset,
  inspectRequiredOxlintConfig,
  listLintPresets,
  toOxlintTsConfigContent,
} from "#lib/integrations/oxlint/config.ts"
import { readLintConfig } from "#lib/project/lint-config.ts"
import { LINT_PRESETS, type LintPreset } from "#lib/project/selection.ts"

const ROOT = "/project"

function loadConfig(content: string) {
  const files = createFileSystemTestContext({ files: { "oxlint.config.ts": content }, root: ROOT })

  return readLintConfig(ROOT, `${ROOT}/oxlint.config.ts`).pipe(
    Effect.map((loaded) => loaded.pipe(Option.flatMap(Result.getSuccess), Option.getOrThrow)),
    Effect.provide(withConfigLoader(Layer.mergeAll(files.layer, makeModuleResolverLayer(ROOT))))
  )
}

describe("toOxlintTsConfigContent", () => {
  // Doctor reads the config that init writes, so the two must agree.
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

  it("import a hyphenated preset under a camel-case name", () => {
    const content = toOxlintTsConfigContent(["react", "react-strict"])

    expect(content).toContain('import reactStrict from "adamantite/lint/react-strict"')
    expect(content).toContain("extends: [core, react, reactStrict, custom()],")
  })

  it("accept only Adamantite preset names", () => {
    expectTypeOf(toOxlintTsConfigContent)
      .parameter(0)
      .toEqualTypeOf<readonly LintPreset[] | undefined>()
    expectTypeOf<Extract<LintPreset, "tailwind">>().toEqualTypeOf<"tailwind">()
    expectTypeOf<Extract<LintPreset, "shadcn">>().toEqualTypeOf<never>()
  })

  it("extend core and custom() in the default config", () => {
    expect(toOxlintTsConfigContent()).toContain("  extends: [core, custom()],")
  })
})

describe("checkAppliesLintPreset", () => {
  it("take only the name of a current preset", () => {
    // A renamed preset must fail every check that names it, instead of matching nothing.
    expectTypeOf(checkAppliesLintPreset).parameter(1).toEqualTypeOf<LintPreset>()
  })
})
