import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import {
  getConflictingScripts,
  getManagedScripts,
  MANAGED_SCRIPT_COMMANDS,
  type Script,
  type ScriptConflict,
} from "#lib/workspace/package-json.ts"

describe("getConflictingScripts", () => {
  it("handles a package.json without a scripts field", () => {
    expect(getConflictingScripts({}, ["check"])).toStrictEqual([])
  })

  it.each<{
    expected: ScriptConflict[]
    name: string
    requested: Script[]
    scripts: Record<string, string>
  }>([
    {
      expected: [],
      name: "skip a requested script that is absent",
      requested: ["check"],
      scripts: { build: "tsc" },
    },
    {
      expected: [],
      name: "skip a requested script with an empty command",
      requested: ["check"],
      scripts: { check: "" },
    },
    {
      expected: [],
      name: "skip a requested script that already runs the managed command",
      requested: ["check"],
      scripts: { check: "adamantite check" },
    },
    {
      expected: [{ command: "tsc && eslint .", script: "check" }],
      name: "report a requested script with a custom command",
      requested: ["check"],
      scripts: { check: "tsc && eslint ." },
    },
    {
      expected: [],
      name: "skip a custom command that was not requested",
      requested: ["fix"],
      scripts: { check: "tsc && eslint ." },
    },
    {
      expected: [
        { command: "eslint --fix .", script: "fix" },
        { command: "knip", script: "analyze" },
      ],
      name: "keep the requested order",
      requested: ["fix", "check", "analyze"],
      scripts: { analyze: "knip", check: "adamantite check", fix: "eslint --fix ." },
    },
  ])("$name", ({ expected, requested, scripts }) => {
    expect(getConflictingScripts({ name: "fixture", scripts }, requested)).toStrictEqual(expected)
  })
})

describe("script management", () => {
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

  it.prop(
    "leave nothing conflicting once the managed commands are adopted",
    { requested: requestedScripts, scripts: manifestScripts },
    ({ requested, scripts }) => {
      const adoptedScripts = { ...scripts }
      for (const script of requested) {
        adoptedScripts[script] = MANAGED_SCRIPT_COMMANDS[script]
      }
      const adopted: PackageJson = { name: "fixture", scripts: adoptedScripts }

      expect(getConflictingScripts(adopted, requested)).toStrictEqual([])

      const managed = getManagedScripts(adopted)
      for (const script of requested) {
        expect(managed).toContain(script)
      }
    },
    { arbitrary: { runs: 300 } }
  )
})
