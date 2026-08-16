import { describe, expect, test } from "@effect/vitest"
import { getConflictingScripts } from "#lib/workspace/package-json.ts"

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
