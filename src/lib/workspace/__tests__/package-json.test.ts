import type { PackageJson } from "type-fest"
import { describe, expect, it, test } from "@effect/vitest"
import { FastCheck } from "effect/testing"
import {
  getConflictingScripts,
  getManagedScripts,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
} from "#lib/workspace/package-json.ts"

describe("getConflictingScripts", () => {
  test("returns scripts whose existing command differs from the managed command", () => {
    const conflicts = getConflictingScripts(
      {
        scripts: {
          "check:monorepo": "sherif --ignore-dependency tailwindcss",
          "fix:monorepo": "sherif --fix --ignore-dependency tailwindcss",
        },
      },
      ["check:monorepo", "fix:monorepo"]
    )

    expect(conflicts).toEqual([
      { command: "sherif --ignore-dependency tailwindcss", script: "check:monorepo" },
      { command: "sherif --fix --ignore-dependency tailwindcss", script: "fix:monorepo" },
    ])
  })

  test("does not report scripts that already use the managed command", () => {
    const conflicts = getConflictingScripts(
      {
        scripts: {
          check: "adamantite check",
          format: "adamantite format",
        },
      },
      ["check", "format"]
    )

    expect(conflicts).toEqual([])
  })

  test("does not report missing or empty scripts", () => {
    const conflicts = getConflictingScripts(
      {
        scripts: {
          check: "",
        },
      },
      ["check", "format"]
    )

    expect(conflicts).toEqual([])
  })

  test("handles a package.json without a scripts field", () => {
    expect(getConflictingScripts({}, ["check"])).toEqual([])
  })

  test("only inspects the requested scripts", () => {
    const conflicts = getConflictingScripts(
      {
        scripts: {
          check: "tsc && eslint .",
          format: "prettier --write .",
        },
      },
      ["format"]
    )

    expect(conflicts).toEqual([{ command: "prettier --write .", script: "format" }])
  })
})

describe("script management", () => {
  // SAFETY: MANAGED_SCRIPT_COMMANDS is a Record<Script, string>, so its keys are Script values.
  const ALL_SCRIPTS = Object.keys(MANAGED_SCRIPT_COMMANDS) as Script[]

  const requestedScripts = FastCheck.subarray(ALL_SCRIPTS)
  const scriptCommand = FastCheck.oneof(
    FastCheck.constantFrom(...Object.values(MANAGED_SCRIPT_COMMANDS)),
    FastCheck.constantFrom("", "tsc && eslint .", "prettier --write ."),
    FastCheck.string()
  )
  const manifestScripts = FastCheck.dictionary(
    FastCheck.oneof(
      FastCheck.constantFrom<string>(...ALL_SCRIPTS),
      FastCheck.constantFrom("build", "dev", "test")
    ),
    scriptCommand,
    { maxKeys: 9 }
  )
  const manifest = manifestScripts.map((scripts): PackageJson => ({ name: "fixture", scripts }))

  it.prop(
    "never report a script as both managed and conflicting",
    { manifest, requested: requestedScripts },
    ({ manifest: packageJson, requested }) => {
      const managed = getManagedScripts(packageJson)
      const conflicts = getConflictingScripts(packageJson, requested)

      for (const conflict of conflicts) {
        expect(managed).not.toContain(conflict.script)
      }
    },
    { fastCheck: { numRuns: 300 } }
  )

  it.prop(
    "only report requested scripts whose non-empty command differs from the managed one",
    { manifest, requested: requestedScripts },
    ({ manifest: packageJson, requested }) => {
      const conflicts = getConflictingScripts(packageJson, requested)

      for (const conflict of conflicts) {
        expect(requested).toContain(conflict.script)
        expect(conflict.command).not.toBe("")
        expect(conflict.command).not.toBe(MANAGED_SCRIPT_COMMANDS[conflict.script])
        expect(packageJson.scripts?.[conflict.script]).toBe(conflict.command)
      }
    },
    { fastCheck: { numRuns: 300 } }
  )

  it.prop(
    "leave nothing conflicting once the managed commands are adopted",
    { requested: requestedScripts, scripts: manifestScripts },
    ({ requested, scripts }) => {
      const adoptedScripts = { ...scripts }
      for (const script of requested) {
        adoptedScripts[script] = MANAGED_SCRIPT_COMMANDS[script]
      }
      const adopted: PackageJson = { name: "fixture", scripts: adoptedScripts }

      expect(getConflictingScripts(adopted, requested)).toEqual([])

      const managed = getManagedScripts(adopted)
      for (const script of requested) {
        expect(managed).toContain(script)
      }
    },
    { fastCheck: { numRuns: 300 } }
  )
})
