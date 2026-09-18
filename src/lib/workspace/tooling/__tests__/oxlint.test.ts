import { describe, expect, test } from "@effect/vitest"
import {
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/workspace/tooling/oxlint.ts"

const requiredOptions = "respectEslintDisableDirectives: true, typeAware: true, typeCheck: true"

describe("inspectRequiredOxlintConfig", () => {
  test("accept the generated config with selected presets", () => {
    expect(inspectRequiredOxlintConfig(toOxlintTsConfigContent(["react", "vitest"]))).toEqual({
      kind: "configured",
    })
  })

  test("accept a direct object export with custom settings", () => {
    expect(
      inspectRequiredOxlintConfig(
        `export default { options: { ${requiredOptions}, custom: false }, rules: { semi: "off" } }`
      )
    ).toEqual({ kind: "configured" })
  })

  test.each([
    "export default {",
    "export default makeConfig()",
    "export default {}",
    "export default { options: getOptions() }",
    "export default { options: {} }",
    `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: false")} } }`,
    `export default { options: { ${requiredOptions.replace("typeAware: true", 'typeAware: "true"')} } }`,
    `export default { options: { ${requiredOptions.replace("typeAware: true", "typeAware: enabled")} } }`,
    `export default { options: { ${requiredOptions}, ...other } }`,
    `export default { options: { ${requiredOptions}, typeAware: false } }`,
    `export default { options: { ${requiredOptions}, [key]: false } }`,
    `export default { ...other, options: { ${requiredOptions} } }`,
    `export default { options: { ${requiredOptions} }, options: {} }`,
    `export default { get options() { return { ${requiredOptions} } } }`,
  ])("report an invalid config without generating a repair: %s", (content) => {
    expect(inspectRequiredOxlintConfig(content)).toEqual({
      kind: "invalid",
      reason: expect.any(String),
    })
  })
})
