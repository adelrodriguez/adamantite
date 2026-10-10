import { describe, expect, it } from "@effect/vitest"
import {
  findCustomRulesCalls,
  inspectRuleFile,
  isRuleFile,
} from "#lib/integrations/tooling/oxlint/custom-rules/inspect.ts"
import { isRuleFile as isLoadedRuleFile } from "#presets/lint/custom.ts"

const IMPORT = 'import custom from "adamantite/lint/custom"\n'

describe("isRuleFile", () => {
  it.each([
    ["no-process-env.ts", true],
    ["no-process-env.mts", true],
    ["no-process-env.js", true],
    ["no-process-env.mjs", true],
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
  it("use the default folder and name for a call without options", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default { extends: [custom()] }`)
    ).toStrictEqual([{ dir: ".adamantite/rules", name: "project" }])
  })

  it("read string literal options under the local import name", () => {
    const content = [
      'import rules from "adamantite/lint/custom"',
      'export default { extends: [rules({ dir: "tooling/rules", name: "acme" }), rules({ "name": `web` })] }',
    ].join("\n")

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      { dir: "tooling/rules", name: "acme" },
      { dir: ".adamantite/rules", name: "web" },
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

describe("inspectRuleFile", () => {
  const RULE =
    'import { defineRule } from "adamantite/rules"\n\nexport default defineRule({ create: () => ({}) })\n'

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
