import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import {
  CUSTOM_RULES_DIRECTORY,
  DynamicCustomRulesCall,
  findCustomRulesCalls,
  isRuleFile,
  LiteralCustomRulesCall,
  RULE_FILE_EXTENSIONS,
} from "#lib/project/custom-rules/inspect.ts"
import {
  DEFAULT_DIRECTORY,
  DEFAULT_PLUGIN_NAME,
  isRuleFile as isLoadedRuleFile,
  RULE_FILE_EXTENSIONS as LOADED_RULE_FILE_EXTENSIONS,
} from "#presets/rules/folder.ts"

const IMPORT = 'import custom from "adamantite/rules"\n'

describe("rules folder defaults", () => {
  it("use the folder and the rule file extensions that custom() loads", () => {
    expect(CUSTOM_RULES_DIRECTORY).toBe(DEFAULT_DIRECTORY)
    expect([...RULE_FILE_EXTENSIONS]).toStrictEqual([...LOADED_RULE_FILE_EXTENSIONS])
  })
})

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
      new LiteralCustomRulesCall({ dir: ".adamantite/lint", name: Option.some("project") }),
    ])
  })

  it("use the default folder and name for a call without options, as custom() does", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default { extends: [custom()] }`)
    ).toStrictEqual([
      new LiteralCustomRulesCall({
        dir: DEFAULT_DIRECTORY,
        name: Option.fromNullOr(DEFAULT_PLUGIN_NAME),
      }),
    ])
  })

  it("read string literal options under the local import name", () => {
    const content = [
      'import rules from "adamantite/rules"',
      'export default { extends: [rules({ dir: "tooling/rules", name: "acme" }), rules({ "name": `web` })] }',
    ].join("\n")

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      new LiteralCustomRulesCall({ dir: "tooling/rules", name: Option.some("acme") }),
      new LiteralCustomRulesCall({ dir: ".adamantite/lint", name: Option.some("web") }),
    ])
  })

  it("mark options that are not string literals as unresolved", () => {
    const content = `${IMPORT}const options = {}\nexport default { extends: [custom({ dir: join("a", "b") }), custom({ ...options }), custom(options)] }`

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      new DynamicCustomRulesCall(),
      new DynamicCustomRulesCall(),
      new DynamicCustomRulesCall(),
    ])
  })

  it("keep a literal dir when only the name is not a string literal", () => {
    const content = `${IMPORT}export default { extends: [custom({ dir: "rules", name: getName() })] }`

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      new LiteralCustomRulesCall({ dir: "rules", name: Option.none() }),
    ])
  })

  it("use the last property when a call repeats an option", () => {
    const content = `${IMPORT}export default { extends: [custom({ dir: "a", dir: "b" })] }`

    expect(findCustomRulesCalls("oxlint.config.ts", content)).toStrictEqual([
      new LiteralCustomRulesCall({ dir: "b", name: Option.some("project") }),
    ])
  })

  it("find no call without the import, or in a file that does not parse", () => {
    expect(
      findCustomRulesCalls("oxlint.config.ts", "export default { extends: [custom()] }")
    ).toStrictEqual([])
    expect(findCustomRulesCalls("oxlint.config.ts", `${IMPORT}export default {`)).toStrictEqual([])
  })
})
