import type { PackageJson } from "type-fest"
import { describe, expect, it, test } from "@effect/vitest"
import * as Schema from "effect/Schema"
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
          analyze: "sherif --ignore-dependency tailwindcss",
          fix: "sherif --fix --ignore-dependency tailwindcss",
        },
      },
      ["analyze", "fix"]
    )

    expect(conflicts).toEqual([
      { command: "sherif --ignore-dependency tailwindcss", script: "analyze" },
      { command: "sherif --fix --ignore-dependency tailwindcss", script: "fix" },
    ])
  })

  test("does not report scripts that already use the managed command", () => {
    const conflicts = getConflictingScripts(
      {
        scripts: {
          check: "adamantite check",
          fix: "adamantite fix",
        },
      },
      ["check", "fix"]
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
      ["check", "fix"]
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
          fix: "prettier --write .",
        },
      },
      ["fix"]
    )

    expect(conflicts).toEqual([{ command: "prettier --write .", script: "fix" }])
  })
})

describe("script management", () => {
  test("exclude retired commands from managed scripts", () => {
    expect(
      getManagedScripts({
        scripts: {
          analyze: "adamantite analyze",
          check: "adamantite check",
          "check:monorepo": "adamantite monorepo",
          fix: "adamantite fix",
          "fix:monorepo": "adamantite monorepo --fix",
          format: "adamantite format",
        },
      })
    ).toEqual(["analyze", "check", "fix"])
  })

  // SAFETY: MANAGED_SCRIPT_COMMANDS is a Record<Script, string>, so its keys are Script values.
  const ALL_SCRIPTS = Object.keys(MANAGED_SCRIPT_COMMANDS) as Script[]

  const requestedScripts = Schema.mutable(
    Schema.UniqueArray(Schema.Literals(ALL_SCRIPTS)).check(Schema.isMaxLength(ALL_SCRIPTS.length))
  )
  const scriptCommand = Schema.Union([
    Schema.Literals(Object.values(MANAGED_SCRIPT_COMMANDS)),
    Schema.Literals(["", "tsc && eslint .", "prettier --write ."]),
    Schema.String,
  ])
  const manifestScripts = Schema.Record(
    Schema.Union([Schema.Literals([...ALL_SCRIPTS]), Schema.Literals(["build", "dev", "test"])]),
    Schema.optionalKey(scriptCommand)
  ).check(Schema.isMaxProperties(9))
  const manifest = Schema.Struct({ name: Schema.Literal("fixture"), scripts: manifestScripts })

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
    { arbitrary: { runs: 300 } }
  )

  it.prop(
    "report exactly the requested scripts whose non-empty command differs from the managed one",
    { manifest, requested: requestedScripts },
    ({ manifest: packageJson, requested }) => {
      const conflicts = getConflictingScripts(packageJson, requested)

      for (const conflict of conflicts) {
        expect(conflict.command).toBe(packageJson.scripts[conflict.script])
      }

      const expectedConflicting = requested.filter((script) => {
        const command = packageJson.scripts[script]

        return (
          command !== undefined && command !== "" && command !== MANAGED_SCRIPT_COMMANDS[script]
        )
      })
      expect(conflicts.map((conflict) => conflict.script)).toEqual(expectedConflicting)
    },
    { arbitrary: { runs: 300 } }
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
    { arbitrary: { runs: 300 } }
  )
})
