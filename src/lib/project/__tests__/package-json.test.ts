import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import {
  checkRunsTool,
  CI_SCRIPTS,
  getScriptsThatRun,
  SCRIPT_ORDER,
  type Script,
} from "#lib/project/package-json.ts"

describe("managed scripts", () => {
  it("list the scripts that run each tool from one table", () => {
    expect({
      knip: getScriptsThatRun("knip"),
      oxfmt: getScriptsThatRun("oxfmt"),
      oxlint: getScriptsThatRun("oxlint"),
      sherif: getScriptsThatRun("sherif"),
    }).toStrictEqual({
      knip: ["analyze"],
      oxfmt: ["check", "fix"],
      oxlint: ["check", "fix"],
      sherif: ["analyze"],
    })
  })

  it.each<{ expected: boolean; scripts: Script[] }>([
    { expected: true, scripts: ["fix"] },
    { expected: true, scripts: ["analyze", "check"] },
    { expected: false, scripts: ["analyze"] },
    { expected: false, scripts: [] },
  ])("say whether $scripts run Oxlint", ({ expected, scripts }) => {
    expect(checkRunsTool(scripts, "oxlint")).toBe(expected)
  })

  it("order every managed script, and run the CI scripts in that order", () => {
    // A new managed script must get a place in the order.
    expectTypeOf<(typeof SCRIPT_ORDER)[number]>().toEqualTypeOf<Script>()
    expect(SCRIPT_ORDER).toStrictEqual(["check", "fix", "analyze"])
    expect(CI_SCRIPTS).toStrictEqual(["check", "analyze"])
  })
})
