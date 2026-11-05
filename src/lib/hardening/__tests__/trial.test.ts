import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  parseTrialCase,
  renderOverrideTrialConfig,
  renderTrialConfig,
} from "#lib/hardening/trial.ts"

describe("parseTrialCase", () => {
  it.effect("read a project path, and a path with the file that holds its content", () =>
    Effect.gen(function* () {
      expect(yield* parseTrialCase("src/cart.ts", "reported")).toStrictEqual({
        expected: "reported",
        path: "src/cart.ts",
        source: Option.none(),
      })
      expect(yield* parseTrialCase("./src/cart.ts=/tmp/a=b.ts", "accepted")).toStrictEqual({
        expected: "accepted",
        path: "src/cart.ts",
        source: Option.some("/tmp/a=b.ts"),
      })
    })
  )

  it.effect.each([
    "../outside.ts",
    "/abs/cart.ts",
    "C:/cart.ts",
    "C:\\cart.ts",
    ".",
    "=/tmp/a.ts",
    "src/cart.ts=",
  ])("reject %s", (value) =>
    Effect.gen(function* () {
      const error = yield* parseTrialCase(value, "reported").pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: "InvalidTrialCase", value })
    })
  )
})

describe("renderTrialConfig", () => {
  it("add an override at the end that sets the rule and turns its plugin on", () => {
    expect(
      renderTrialConfig({
        config: "oxlint.config.ts",
        files: ["src/list.tsx"],
        plugin: Option.some("react"),
        rule: "react/jsx-key",
        settingOptions: [{ checkFragmentShorthand: true }],
      })
    ).toBe(
      [
        "// `adamantite rule try` wrote this file in a copy of the project.",
        'import config from "./oxlint.config.ts"',
        "",
        "export default {",
        "  ...config,",
        '  overrides: [...(config.overrides ?? []), {"files":["src/list.tsx"],"plugins":["react"],"rules":{"react/jsx-key":["error",{"checkFragmentShorthand":true}]}}],',
        "}",
        "",
      ].join("\n")
    )
  })

  it("leave the plugins as they are for a rule without a built-in plugin", () => {
    expect(
      renderTrialConfig({
        config: "oxlint.config.mjs",
        files: ["a.ts"],
        plugin: Option.none(),
        rule: "project/no-foo",
        settingOptions: [],
      })
    ).toContain('{"files":["a.ts"],"rules":{"project/no-foo":["error"]}}')
  })
})

describe("renderOverrideTrialConfig", () => {
  it("remove only the given rules from the overrides at the given positions", () => {
    expect(
      renderOverrideTrialConfig({
        config: "oxlint.config.ts",
        removals: new Map([[1, ["project/no-foo"]]]),
      })
    ).toBe(
      [
        "// `adamantite harden` wrote this file in a copy of the project.",
        'import config from "./oxlint.config.ts"',
        "",
        'const removals = new Map([[1,["project/no-foo"]]])',
        "",
        "export default {",
        "  ...config,",
        "  overrides: (config.overrides ?? []).map((override, index) => ({",
        "    ...override,",
        "    rules: Object.fromEntries(",
        "      Object.entries(override.rules ?? {}).filter(",
        "        ([rule]) => !(removals.get(index) ?? []).includes(rule)",
        "      )",
        "    ),",
        "  })),",
        "}",
        "",
      ].join("\n")
    )
  })
})
