import { describe, expect, it, test } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import { FastCheck } from "effect/testing"
import { getCIWorkflowEntries, hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  MANAGED_SCRIPT_COMMANDS,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"

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

describe("CI workflow entries", () => {
  // SAFETY: MANAGED_SCRIPT_COMMANDS is a Record<Script, string>, so its keys are Script values.
  const ALL_SCRIPTS = Object.keys(MANAGED_SCRIPT_COMMANDS) as Script[]
  const PACKAGE_MANAGERS: SupportedPackageManager[] = ["bun", "deno", "npm", "pnpm", "yarn"]

  const packageManager = FastCheck.constantFrom(...PACKAGE_MANAGERS)
  const scripts = FastCheck.subarray(ALL_SCRIPTS)

  it.prop(
    "agree with hasCICompatibleScripts for every package manager and script subset",
    { packageManager, scripts },
    ({ packageManager: manager, scripts: selected }) => {
      const entries = getCIWorkflowEntries(manager, selected)

      expect(entries.length > 0).toBe(hasCICompatibleScripts(selected))
      for (const entry of entries) {
        expect(entry.command).toContain(manager)
      }
    },
    { fastCheck: { numRuns: 300 } }
  )

  it.prop(
    "produce uniquely named entries independent of script order",
    { packageManager, scripts },
    ({ packageManager: manager, scripts: selected }) => {
      const entries = getCIWorkflowEntries(manager, selected)
      const reversed = getCIWorkflowEntries(manager, EffectArray.reverse(selected))

      expect(reversed).toEqual(entries)
      expect(new Set(entries.map((entry) => entry.name)).size).toBe(entries.length)
      expect(entries.length).toBeLessThanOrEqual(selected.length)
    },
    { fastCheck: { numRuns: 300 } }
  )

  it.prop(
    "never lose an entry when more scripts are requested",
    { extra: FastCheck.subarray(ALL_SCRIPTS), packageManager, scripts },
    ({ extra, packageManager: manager, scripts: selected }) => {
      const baseline = getCIWorkflowEntries(manager, selected)
      const expanded = getCIWorkflowEntries(manager, [...selected, ...extra])
      const expandedNames = new Set(expanded.map((entry) => entry.name))

      for (const entry of baseline) {
        expect(expandedNames).toContain(entry.name)
      }
    },
    { fastCheck: { numRuns: 300 } }
  )
})
