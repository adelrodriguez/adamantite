import { describe, expect, test } from "@effect/vitest"
import {
  findCustomRulesCalls,
  inspectRuleFile,
  isRuleFile,
} from "#lib/integrations/tooling/oxlint/custom-rules/inspect.ts"
import { isRuleFile as isLoadedRuleFile } from "#presets/lint/custom.ts"

const IMPORT = 'import custom from "adamantite/lint/custom"\n'

describe("isRuleFile", () => {
  test.each([
    "no-process-env.ts",
    "no-process-env.mts",
    "no-process-env.js",
    "no-process-env.mjs",
    "_helpers.ts",
    "types.d.ts",
    "types.d.mts",
    "AGENTS.md",
    "component.tsx",
    "legacy.cjs",
  ])("agree with the files that custom() loads: %s", (name) => {
    expect(isRuleFile(name)).toBe(isLoadedRuleFile(name))
  })

  test("accept rule files and reject helpers and other files", () => {
    expect(isRuleFile("no-process-env.ts")).toBe(true)
    expect(isRuleFile("_helpers.ts")).toBe(false)
    expect(isRuleFile("types.d.ts")).toBe(false)
    expect(isRuleFile("AGENTS.md")).toBe(false)
  })
})

describe("findCustomRulesCalls", () => {
  test("use the default folder and name for a call without options", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default { extends: [custom()] }`)
    ).toEqual([{ dir: ".adamantite/rules", name: "project" }])
  })

  test("read string literal options under the local import name", () => {
    const content = [
      'import rules from "adamantite/lint/custom"',
      'export default { extends: [rules({ dir: "tooling/rules", name: "acme" }), rules({ "name": `web` })] }',
    ].join("\n")

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toEqual([
      { dir: "tooling/rules", name: "acme" },
      { dir: ".adamantite/rules", name: "web" },
    ])
  })

  test("mark options that are not string literals as unresolved", () => {
    const content = `${IMPORT}const options = {}\nexport default { extends: [custom({ dir: join("a", "b") }), custom({ ...options }), custom(options)] }`

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toEqual([
      { dir: null, name: "project" },
      { dir: null, name: null },
      { dir: null, name: null },
    ])
  })

  test("find no call without the import, or in a file that does not parse", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", "export default { extends: [custom()] }")
    ).toEqual([])
    expect(findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default {`)).toEqual([])
  })
})

describe("inspectRuleFile", () => {
  const RULE =
    'import { defineRule } from "adamantite/rules"\n\nexport default defineRule({ create: () => ({}) })\n'

  test("accept a rule with erasable TypeScript", () => {
    const content = [
      "type Options = { readonly names: string[] }",
      "interface State { count: number }",
      "declare namespace Types { const value: number }",
      "namespace Shapes { export type Point = { x: number } }",
      "declare enum Kind { A }",
      RULE,
    ].join("\n")

    expect(inspectRuleFile("rule.ts", content)).toEqual([])
  })

  test("accept a default export through an export list", () => {
    expect(
      inspectRuleFile(
        "rule.ts",
        "const rule = { create: () => ({}) }\nexport { rule as default }\n"
      )
    ).toEqual([])
  })

  test("report TypeScript that type stripping cannot erase", () => {
    const content = [
      "enum Kind { A }",
      "namespace Values { export const value = 1 }",
      "class Store { constructor(private readonly name: string) {} }",
      'import fs = require("node:fs")',
      RULE,
    ].join("\n")

    expect(inspectRuleFile("rule.ts", content)).toEqual([
      "Line 1: `enum` needs a TypeScript transform, which type stripping does not do.",
      "Line 2: A `namespace` with values needs a TypeScript transform, which type stripping does not do.",
      "Line 3: A parameter property needs a TypeScript transform, which type stripping does not do.",
      "Line 4: `import x = ...` needs a TypeScript transform, which type stripping does not do.",
    ])
  })

  test("report a missing default export", () => {
    expect(inspectRuleFile("rule.ts", "export const rule = {}\n")).toEqual([
      "The file has no default export. Export the rule as default.",
    ])
  })

  test("report syntax errors", () => {
    const [problem, ...rest] = inspectRuleFile("rule.ts", "export default {\n")

    expect(problem).toMatch(/^Syntax error: /)
    expect(rest).toEqual([])
  })
})
