import { describe, expect, it } from "@effect/vitest"
import {
  findCustomRulesCalls,
  hasLegacyRuleImports,
  inspectRuleFile,
  isRuleFile,
} from "#lib/workspace/custom-rules/inspect.ts"
import {
  DEFAULT_DIRECTORY,
  DEFAULT_PLUGIN_NAME,
  isRuleFile as isLoadedRuleFile,
} from "#presets/rules/folder.ts"

const IMPORT = 'import custom from "adamantite/rules"\n'

describe("isRuleFile", () => {
  it.each([
    ["no-process-env.ts", true],
    ["no-process-env.mts", true],
    ["no-process-env.js", true],
    ["no-process-env.mjs", true],
    ["no-process-env.test.ts", false],
    ["no-process-env.test.mts", false],
    ["no-process-env.test.js", false],
    ["no-process-env.test.mjs", false],
    ["_helpers.ts", false],
    ["types.d.ts", false],
    ["types.d.mts", false],
    ["AGENTS.md", false],
    ["component.tsx", false],
    ["legacy.cjs", false],
  ])("classify %s as a rule file: %s, as custom() does", (name, expected) => {
    expect(isRuleFile(name)).toBe(expected)
    expect(isLoadedRuleFile(name)).toBe(expected)
  })
})

describe("findCustomRulesCalls", () => {
  it("ignore the retired rules-folder import", () => {
    const content = [
      'import custom from "adamantite/rules"',
      'import legacy from "adamantite/lint/custom"',
      'export default { extends: [custom(), legacy({ dir: ".adamantite/rules", name: "old" })] }',
    ].join("\n")

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      { dir: ".adamantite/lint", name: "project" },
    ])
  })

  it("use the default folder and name for a call without options, as custom() does", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default { extends: [custom()] }`)
    ).toStrictEqual([{ dir: DEFAULT_DIRECTORY, name: DEFAULT_PLUGIN_NAME }])
  })

  it("read string literal options under the local import name", () => {
    const content = [
      'import rules from "adamantite/rules"',
      'export default { extends: [rules({ dir: "tooling/rules", name: "acme" }), rules({ "name": `web` })] }',
    ].join("\n")

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      { dir: "tooling/rules", name: "acme" },
      { dir: ".adamantite/lint", name: "web" },
    ])
  })

  it("mark options that are not string literals as unresolved", () => {
    const content = `${IMPORT}const options = {}\nexport default { extends: [custom({ dir: join("a", "b") }), custom({ ...options }), custom(options)] }`

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      { dir: null, name: "project" },
      { dir: null, name: null },
      { dir: null, name: null },
    ])
  })

  it("find no call without the import, or in a file that does not parse", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", "export default { extends: [custom()] }")
    ).toStrictEqual([])
    expect(findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default {`)).toStrictEqual([])
  })
})

describe("hasLegacyRuleImports", () => {
  it.each([
    'import custom from "adamantite/lint/custom"',
    'import { defineRule as rule } from "adamantite/rules"',
    'import type { Rule } from "adamantite/rules"',
    'export { defineRule } from "adamantite/rules"',
    'export { default } from "adamantite/lint/custom"',
    'export * from "adamantite/lint/custom"',
  ])("report the old import in %s", (content) => {
    expect(hasLegacyRuleImports("rule.ts", content)).toBe(true)
  })

  it.each([
    'import custom, { type CustomRulesOptions } from "adamantite/rules"',
    'import { defineRule } from "adamantite/rules/plugin"',
    'export { default, type CustomRulesOptions } from "adamantite/rules"',
    '// import { defineRule } from "adamantite/rules"',
    'const text = "adamantite/lint/custom"',
  ])("accept the current API and ignore text in %s", (content) => {
    expect(hasLegacyRuleImports("rule.ts", content)).toBe(false)
  })
})

describe("inspectRuleFile", () => {
  const RULE =
    'import { defineRule } from "adamantite/rules/plugin"\n\nexport default defineRule({ create: () => ({}) })\n'

  it("accept a rule with erasable TypeScript", () => {
    const content = [
      "type Options = { readonly names: string[] }",
      "interface State { count: number }",
      "declare namespace Types { const value: number }",
      "namespace Shapes { export type Point = { x: number } }",
      "declare enum Kind { A }",
      RULE,
    ].join("\n")

    expect(inspectRuleFile("rule.ts", content)).toStrictEqual([])
  })

  it("accept a default export through an export list", () => {
    expect(
      inspectRuleFile(
        "rule.ts",
        "const rule = { create: () => ({}) }\nexport { rule as default }\n"
      )
    ).toStrictEqual([])
  })

  it("report TypeScript that type stripping cannot erase", () => {
    const content = [
      "enum Kind { A }",
      "namespace Values { export const value = 1 }",
      "class Store { constructor(private readonly name: string) {} }",
      'import fs = require("node:fs")',
      RULE,
    ].join("\n")

    expect(inspectRuleFile("rule.ts", content)).toStrictEqual([
      "Line 1: `enum` needs a TypeScript transform, which type stripping does not do.",
      "Line 2: A `namespace` with values needs a TypeScript transform, which type stripping does not do.",
      "Line 3: A parameter property needs a TypeScript transform, which type stripping does not do.",
      "Line 4: `import x = ...` needs a TypeScript transform, which type stripping does not do.",
    ])
  })

  it.each([
    "export default interface Rule { create(): void }\n",
    "const rule = {}\ntype Rule = typeof rule\nexport type { Rule as default }\n",
    "const rule = {}\ntype Rule = typeof rule\nexport { type Rule as default }\n",
  ])("report a default export that type stripping erases: %s", (content) => {
    expect(inspectRuleFile("rule.ts", content)).toStrictEqual([
      "The file has no default export. Export the rule as default.",
    ])
  })

  it("report a missing default export", () => {
    expect(inspectRuleFile("rule.ts", "export const rule = {}\n")).toStrictEqual([
      "The file has no default export. Export the rule as default.",
    ])
  })

  it("report syntax errors", () => {
    const [problem, ...rest] = inspectRuleFile("rule.ts", "export default {\n")

    expect(problem).toMatch(/^Syntax error: /)
    expect(rest).toStrictEqual([])
  })
})
