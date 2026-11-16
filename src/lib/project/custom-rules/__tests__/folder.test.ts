import { describe, expect, it } from "@effect/vitest"
import {
  CUSTOM_RULES_DIRECTORY,
  isRuleFile,
  RULE_FILE_EXTENSIONS,
} from "#lib/project/custom-rules/folder.ts"
import {
  DEFAULT_DIRECTORY,
  isRuleFile as isLoadedRuleFile,
  RULE_FILE_EXTENSIONS as LOADED_RULE_FILE_EXTENSIONS,
} from "#presets/rules/folder.ts"

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
