import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { replaceConfigs } from "#lib/hardening/trial.ts"
import {
  parseTrialCase,
  renderOverrideTrialConfig,
  renderTrialConfig,
  TRIAL_SKIPPED_MODULES_ENTRY,
} from "#lib/hardening/trial.ts"
import { InvalidTrialCase } from "#lib/shared/errors.ts"
import { CACHE_DIRECTORY } from "#presets/rules/folder.ts"

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

      expect(error).toBeInstanceOf(InvalidTrialCase)
      expect(error).toMatchObject({ value })
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

describe("replaceConfigs", () => {
  it("take only a project copy, and each config one time", () => {
    // A path in the project would rename the user's config, so it must not type-check.
    expectTypeOf<Parameters<typeof replaceConfigs>[0]>().not.toEqualTypeOf<string>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof replaceConfigs>[0]>()
    // A map holds each config one time, so a second replacement cannot move the trial config.
    expectTypeOf<Parameters<typeof replaceConfigs>[1]>().toEqualTypeOf<
      ReadonlyMap<string, (base: string) => string>
    >()
  })
})

describe("project copy", () => {
  it("skip the node_modules folder where custom() writes its entry modules", () => {
    // The copy links every other node_modules entry to the project, so a linked cache folder
    // would let custom() in the copy write into the project.
    expect(CACHE_DIRECTORY.split(/[/\\]/u).slice(0, 2)).toStrictEqual([
      "node_modules",
      TRIAL_SKIPPED_MODULES_ENTRY,
    ])
  })
})
