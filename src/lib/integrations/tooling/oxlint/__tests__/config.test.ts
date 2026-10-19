import { describe, expect, it } from "@effect/vitest"
import {
  getImportedLintPresets,
  getTestPresetFindings,
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

function makeConfig(imports: string[], extended: string) {
  return [
    'import core from "adamantite/lint"',
    ...imports,
    "",
    `export default { extends: [${extended}], options: { ${requiredOptions} } }`,
    "",
  ].join("\n")
}

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

  it("extend core and custom() in the default config", () => {
    expect(toOxlintTsConfigContent()).toContain("  extends: [core, custom()],")
  })

  it("scope a test preset to its test files in overrides", () => {
    const content = toOxlintTsConfigContent(["react", "vitest"])

    expect(content).toContain('import vitest, { testFiles } from "adamantite/lint/vitest"')
    expect(content).toContain("  extends: [core, react, custom()],")
    expect(content).toContain(
      [
        "  overrides: [",
        "    {",
        "      files: testFiles,",
        "      plugins: vitest.plugins,",
        "      rules: vitest.rules,",
        "    },",
        "  ],",
      ].join("\n")
    )
    expect(getImportedLintPresets(content)).toStrictEqual(["react", "vitest"])
  })

  it("give each test preset's test files their own import name", () => {
    const content = toOxlintTsConfigContent(["vitest", "jest"])

    expect(content).toContain(
      'import vitest, { testFiles as vitestTestFiles } from "adamantite/lint/vitest"'
    )
    expect(content).toContain(
      'import jest, { testFiles as jestTestFiles } from "adamantite/lint/jest"'
    )
    expect(content).toContain("      files: vitestTestFiles,\n      plugins: vitest.plugins,")
    expect(content).toContain("      files: jestTestFiles,\n      plugins: jest.plugins,")
  })

  it("write no overrides without a test preset", () => {
    expect(toOxlintTsConfigContent(["react"])).not.toContain("overrides")
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

describe("getTestPresetFindings", () => {
  it("report a test preset in the global extends", () => {
    const content = makeConfig(['import vitest from "adamantite/lint/vitest"'], "core, vitest")

    expect(getTestPresetFindings(content)).toStrictEqual([
      {
        currentState:
          "`oxlint.config.ts` lists the `vitest` preset in the global `extends`. Its test rules also report files that are not tests.",
        goal: [
          "Remove the `vitest` preset from `extends`. Keep the other presets and `custom()` in `extends`.",
          "Add an `overrides` entry that spreads the preset over its test files, such as `{ files: testFiles, plugins: vitest.plugins, rules: vitest.rules }` with `testFiles` imported from `adamantite/lint/vitest`.",
        ],
        id: "unscoped-oxlint-test-preset",
        integration: "oxlint",
        notes: [
          "`testFiles` lists the files that the test runner runs as tests by default. If the project configures its test runner to find tests in other files, set `files` to those patterns.",
        ],
        reference: { content: toOxlintTsConfigContent(["vitest"]), language: "ts" },
        title: "Unscoped oxlint test preset",
      },
    ])
  })

  it("report every test preset in the global extends under its import name", () => {
    const content = makeConfig(
      [
        'import jestPreset from "adamantite/lint/jest"',
        'import vitestPreset from "adamantite/lint/vitest"',
      ],
      "core, jestPreset, vitestPreset"
    )

    expect(getTestPresetFindings(content)).toMatchObject([
      {
        currentState:
          "`oxlint.config.ts` lists the `jest` and `vitest` presets in the global `extends`. Their test rules also report files that are not tests.",
        goal: [
          "Remove the `jest` and `vitest` presets from `extends`. Keep the other presets and `custom()` in `extends`.",
          "Add an `overrides` entry that spreads each preset over its test files, such as `{ files: testFiles, plugins: jestPreset.plugins, rules: jestPreset.rules }` with `testFiles` imported from `adamantite/lint/jest`.",
        ],
      },
    ])
  })

  it.each([
    ["the generated config", toOxlintTsConfigContent(["react", "vitest", "jest"])],
    [
      "a test preset in an override",
      [
        'import vitest from "adamantite/lint/vitest"',
        `export default { extends: [], overrides: [{ files: ["**/*.test.ts"], plugins: vitest.plugins, rules: vitest.rules }] }`,
      ].join("\n"),
    ],
    [
      "another preset in the global extends",
      makeConfig(['import node from "adamantite/lint/node"'], "core, node"),
    ],
    [
      "an identifier that is not a test preset import",
      makeConfig(['import vitest from "./vitest.ts"'], "core, vitest"),
    ],
    [
      "a config that does not parse",
      'import vitest from "adamantite/lint/vitest"\nexport default {',
    ],
  ])("report no finding for %s", (_, content) => {
    expect(getTestPresetFindings(content)).toStrictEqual([])
  })
})
