import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Option from "effect/Option"
import {
  checkImportsLintPreset,
  getImportedLintPresets,
  inspectExtendsOrder,
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"
import {
  LINT_PRESETS,
  type LintPreset,
  type RetiredLintPreset,
} from "#lib/integrations/tooling/oxlint/presets.ts"

const unsupportedConfigReason =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to inspect `options`."

const unsupportedOptionsReason =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can inspect."

const ambiguousOptionsReason =
  "`oxlint.config.ts` has an `options` object Adamantite cannot inspect. Make sure each required option is a plain `key: true | false` property. Avoid spreads (`...rest`), computed keys (`[name]: ...`), duplicate keys, methods/getters/setters, and non-boolean-literal values."

const missingOptionsReason = "The required Oxlint options are missing."
const invalidOptionsReason = "The required Oxlint options are missing or are not set to true."

const requiredOptions = "respectEslintDisableDirectives: true, typeAware: true, typeCheck: true"

const exportGoal =
  "Export the config object literal directly from `oxlint.config.ts`, with or without `defineConfig(...)`. Preserve every project setting."

const optionsGoal =
  "Set `respectEslintDisableDirectives`, `typeAware`, and `typeCheck` to `true` in the `options` object. Preserve every other project setting."

describe("inspectRequiredOxlintConfig", () => {
  it("accept the generated config with selected presets", () => {
    expect(inspectRequiredOxlintConfig(toOxlintTsConfigContent(["react", "vitest"]))).toStrictEqual(
      {
        kind: "configured",
      }
    )
  })

  it("accept a direct object export with custom settings", () => {
    expect(
      inspectRequiredOxlintConfig(
        `export default { options: { ${requiredOptions}, custom: false }, rules: { semi: "off" } }`
      )
    ).toStrictEqual({ kind: "configured" })
  })

  it.each([
    [
      "export default {",
      unsupportedConfigReason,
      "Fix the syntax errors in `oxlint.config.ts`. Preserve every project setting.",
    ],
    ["export default makeConfig()", unsupportedConfigReason, exportGoal],
    ["export default {}", missingOptionsReason, optionsGoal],
    ["export default { options: getOptions() }", unsupportedOptionsReason, optionsGoal],
    ["export default { options: {} }", invalidOptionsReason, optionsGoal],
    [
      `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: false")} } }`,
      invalidOptionsReason,
      optionsGoal,
    ],
    [
      `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: enabled")} } }`,
      invalidOptionsReason,
      optionsGoal,
    ],
    [
      `export default { options: { ${requiredOptions}, ...other } }`,
      ambiguousOptionsReason,
      optionsGoal,
    ],
    [
      `export default { options: { ${requiredOptions}, typeAware: false } }`,
      ambiguousOptionsReason,
      optionsGoal,
    ],
    [
      `export default { options: { ${requiredOptions}, [key]: false } }`,
      ambiguousOptionsReason,
      optionsGoal,
    ],
    [
      `export default { ...other, options: { ${requiredOptions} } }`,
      unsupportedOptionsReason,
      optionsGoal,
    ],
    [
      `export default { options: { ${requiredOptions} }, options: {} }`,
      unsupportedOptionsReason,
      optionsGoal,
    ],
    [
      `export default { get options() { return { ${requiredOptions} } } }`,
      unsupportedOptionsReason,
      optionsGoal,
    ],
  ])("report an invalid config without generating a repair: %s", (content, reason, goal) => {
    expect(inspectRequiredOxlintConfig(content)).toStrictEqual({
      goal,
      kind: "invalid",
      reason,
    })
  })
})

/**
 * A config that exports an object literal with the `extends` value.
 */
function toExtendsConfig(imports: readonly string[], extendsValue: string) {
  return [...imports, "", `export default { extends: ${extendsValue} }`, ""].join("\n")
}

const CORE_IMPORT = 'import core from "adamantite/lint"'
const STRICT_IMPORT = 'import strict from "adamantite/lint/strict"'
const EFFECT_IMPORT = 'import effect from "adamantite/lint/effect"'

describe("inspectExtendsOrder", () => {
  it("find no preset before core in a generated config", () => {
    expect(inspectExtendsOrder(toOxlintTsConfigContent(LINT_PRESETS))).toStrictEqual(Option.none())
  })

  it("find a preset that comes before core", () => {
    expect(
      inspectExtendsOrder(
        toOxlintTsConfigContent(["strict"]).replace("[core, strict,", "[strict, core,")
      )
    ).toStrictEqual(Option.some({ before: ["strict"], core: "core" }))
  })

  it("list each preset that comes before core, and no preset after it", () => {
    expect(
      inspectExtendsOrder(
        toExtendsConfig(
          [CORE_IMPORT, STRICT_IMPORT, EFFECT_IMPORT, 'import node from "adamantite/lint/node"'],
          "[effect, strict, core, node]"
        )
      )
    ).toStrictEqual(Option.some({ before: ["effect", "strict"], core: "core" }))
  })

  it("use the local names of the imports", () => {
    expect(
      inspectExtendsOrder(
        toExtendsConfig(
          [
            'import base, { ignorePatterns } from "adamantite/lint"',
            'import rules from "adamantite/lint/strict"',
          ],
          "[rules, base]"
        )
      )
    ).toStrictEqual(Option.some({ before: ["rules"], core: "base" }))
  })

  it("accept an entry before core that is not an Adamantite preset", () => {
    expect(
      inspectExtendsOrder(
        toExtendsConfig(
          [CORE_IMPORT, STRICT_IMPORT, 'import shared from "./shared.ts"'],
          "[shared, ...more, core, strict]"
        )
      )
    ).toStrictEqual(Option.none())
  })

  it.each([
    ["does not extend core", toExtendsConfig([CORE_IMPORT, STRICT_IMPORT], "[strict]")],
    ["has no extends array literal", toExtendsConfig([CORE_IMPORT, STRICT_IMPORT], "presets")],
    ["has no extends property", [CORE_IMPORT, "", "export default {}", ""].join("\n")],
    ["does not parse", "export default {"],
  ])("find no preset before core in a config that %s", (_, content) => {
    expect(inspectExtendsOrder(content)).toStrictEqual(Option.none())
  })
})

describe("getImportedLintPresets", () => {
  it("list the presets a generated config imports, without core and custom", () => {
    expect(getImportedLintPresets(toOxlintTsConfigContent(["react", "tailwind"]))).toStrictEqual([
      "react",
      "tailwind",
    ])
  })

  it("import a hyphenated preset under a camel-case name", () => {
    const content = toOxlintTsConfigContent(["react", "react-strict"])

    expect(content).toContain('import reactStrict from "adamantite/lint/react-strict"')
    expect(content).toContain("extends: [core, react, reactStrict, custom()],")
    expect(getImportedLintPresets(content)).toStrictEqual(["react", "react-strict"])
  })

  it("import every preset as a valid import in a config that parses", () => {
    const content = toOxlintTsConfigContent(LINT_PRESETS)

    expect(inspectRequiredOxlintConfig(content)).toStrictEqual({ kind: "configured" })
    expect(getImportedLintPresets(content)).toStrictEqual([...LINT_PRESETS])
  })

  it("accept only Adamantite preset names", () => {
    // @ts-expect-error - only LintPreset names are accepted
    expect(getImportedLintPresets(toOxlintTsConfigContent(["foo.bar"]))).toStrictEqual([])
    expectTypeOf<Extract<LintPreset, "tailwind">>().toEqualTypeOf<"tailwind">()
    expectTypeOf<Extract<LintPreset, "shadcn">>().toEqualTypeOf<never>()
  })

  it("extend core and custom() in the default config", () => {
    expect(toOxlintTsConfigContent()).toContain("  extends: [core, custom()],")
  })

  it("list no preset for a config with only the core preset", () => {
    expect(getImportedLintPresets(toOxlintTsConfigContent())).toStrictEqual([])
  })

  it("list no preset for a config that does not parse", () => {
    expect(
      getImportedLintPresets('import tailwind from "adamantite/lint/tailwind"\nexport default {')
    ).toStrictEqual([])
  })
})

describe("checkImportsLintPreset", () => {
  it("take only the name of a current or retired preset", () => {
    // A renamed preset must fail every check that names it, instead of matching nothing.
    expectTypeOf(checkImportsLintPreset)
      .parameter(1)
      .toEqualTypeOf<LintPreset | RetiredLintPreset>()
  })
})
