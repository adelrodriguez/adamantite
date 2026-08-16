import { describe, expect, test } from "@effect/vitest"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"

describe("hasCICompatibleScripts", () => {
  test("return true when the check script is present", () => {
    expect(hasCICompatibleScripts(["check"])).toBe(true)
  })

  test("return true when the format script is present", () => {
    expect(hasCICompatibleScripts(["format"])).toBe(true)
  })

  test("return true when the check:monorepo script is present", () => {
    expect(hasCICompatibleScripts(["check:monorepo"])).toBe(true)
  })

  test("return false when only fix scripts are present", () => {
    expect(hasCICompatibleScripts(["fix", "fix:monorepo"])).toBe(false)
  })

  test("return false for an empty array", () => {
    expect(hasCICompatibleScripts([])).toBe(false)
  })

  test("return true when CI and non-CI scripts are mixed", () => {
    expect(hasCICompatibleScripts(["fix", "check", "fix:monorepo"])).toBe(true)
  })
})
