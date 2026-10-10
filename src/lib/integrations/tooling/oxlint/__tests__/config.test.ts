import { describe, expect, it } from "@effect/vitest"
import {
  getImportedLintPresets,
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"

const unsupportedConfigReason =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to inspect `options`."
const unsupportedOptionsReason =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can inspect."
const ambiguousOptionsReason =
  "`oxlint.config.ts` has an `options` object Adamantite cannot inspect. Make sure each required option is a plain `key: true | false` property. Avoid spreads (`...rest`), computed keys (`[name]: ...`), duplicate keys, methods/getters/setters, and non-boolean-literal values."
const missingOptionsReason = "The required Oxlint options are missing."
const invalidOptionsReason = "The required Oxlint options are missing or are not set to true."

const requiredOptions = "respectEslintDisableDirectives: true, typeAware: true, typeCheck: true"

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
    ["export default {", unsupportedConfigReason],
    ["export default makeConfig()", unsupportedConfigReason],
    ["export default {}", missingOptionsReason],
    ["export default { options: getOptions() }", unsupportedOptionsReason],
    ["export default { options: {} }", invalidOptionsReason],
    [
      `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: false")} } }`,
      invalidOptionsReason,
    ],
    [
      `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: enabled")} } }`,
      invalidOptionsReason,
    ],
    [`export default { options: { ${requiredOptions}, ...other } }`, ambiguousOptionsReason],
    [
      `export default { options: { ${requiredOptions}, typeAware: false } }`,
      ambiguousOptionsReason,
    ],
    [`export default { options: { ${requiredOptions}, [key]: false } }`, ambiguousOptionsReason],
    [`export default { ...other, options: { ${requiredOptions} } }`, unsupportedOptionsReason],
    [`export default { options: { ${requiredOptions} }, options: {} }`, unsupportedOptionsReason],
    [
      `export default { get options() { return { ${requiredOptions} } } }`,
      unsupportedOptionsReason,
    ],
  ])("report an invalid config without generating a repair: %s", (content, reason) => {
    expect(inspectRequiredOxlintConfig(content)).toStrictEqual({
      kind: "invalid",
      reason,
    })
  })
})

describe("getImportedLintPresets", () => {
  it("list the presets a generated config imports, without core and custom", () => {
    expect(getImportedLintPresets(toOxlintTsConfigContent(["react", "shadcn"]))).toStrictEqual([
      "react",
      "shadcn",
    ])
  })

  it("import a hyphenated preset under a camel-case name", () => {
    const content = toOxlintTsConfigContent(["react", "react-strict"])

    expect(content).toContain('import reactStrict from "adamantite/lint/react-strict"')
    expect(content).toContain("extends: [core, react, reactStrict, custom()],")
    expect(getImportedLintPresets(content)).toStrictEqual(["react", "react-strict"])
  })

  it("list no preset for a config with only the core preset", () => {
    expect(getImportedLintPresets(toOxlintTsConfigContent())).toStrictEqual([])
  })

  it("list no preset for a config that does not parse", () => {
    expect(
      getImportedLintPresets('import shadcn from "adamantite/lint/shadcn"\nexport default {')
    ).toStrictEqual([])
  })
})
