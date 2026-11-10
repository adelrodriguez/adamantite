import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import {
  describeLintPreset,
  findMissingRequiredPresets,
  LINT_PRESETS,
  lintPresets,
} from "#lib/integrations/tooling/oxlint/presets.ts"
import packageJson from "../../../../../../package.json" with { type: "json" }

const PRESET_FILES_DIR = join(import.meta.dirname, "../../../../../../presets/lint")
const presetsWithPlugins = lintPresets.flatMap((preset) => ("plugin" in preset ? [preset] : []))

function isLintExport([subpath]: readonly [string, unknown]) {
  return subpath === "./lint" || subpath.startsWith("./lint/")
}

function presetExport(file: string) {
  return { default: `./dist/presets/lint/${file}.js`, types: `./dist/presets/lint/${file}.d.ts` }
}

function getPreset(name: string) {
  return Option.getOrThrow(Array.findFirst(lintPresets, (preset) => preset.name === name))
}

describe("lintPresets", () => {
  it("list every published preset file except core", () => {
    const files = readdirSync(PRESET_FILES_DIR)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => basename(file, ".ts"))
      .filter((name) => name !== "core")

    expect(Array.sort(LINT_PRESETS, Order.String)).toStrictEqual(Array.sort(files, Order.String))
  })

  it("publish core and each preset at its own subpath, so no other preset file becomes public", () => {
    expect(
      Object.fromEntries(Object.entries(packageJson.exports).filter(isLintExport))
    ).toStrictEqual(
      Object.fromEntries([
        ["./lint", presetExport("core")],
        ...LINT_PRESETS.map((name) => [`./lint/${name}`, presetExport(name)]),
      ])
    )
  })

  it("keep setup out of the written hints, so describeLintPreset adds it once", () => {
    expect(lintPresets.filter((preset) => /\b(?:install|select)/i.test(preset.hint))).toStrictEqual(
      []
    )
  })

  it.each(presetsWithPlugins)("name $plugin.name in the hint of the $name preset", (preset) => {
    expect(describeLintPreset(preset)).toContain(`Installs ${preset.plugin.name}`)
  })
})

describe("describeLintPreset", () => {
  it("add the plugin package and the required presets after the rule hint", () => {
    expect(describeLintPreset(getPreset("react-strict"))).toBe(
      "Keep state, effect, and memo hooks in hook files. Installs oxlint-plugin-react-doctor and selects the react preset."
    )
    expect(describeLintPreset(getPreset("react"))).toBe(
      "Check React code, JSX accessibility, and performance."
    )
  })
})

describe("findMissingRequiredPresets", () => {
  it("report a required preset that the selection lacks", () => {
    expect(findMissingRequiredPresets(["react-strict", "vitest"])).toStrictEqual([
      { required: "react", requiredBy: "react-strict" },
    ])
  })

  it("report nothing when the selection has every required preset", () => {
    expect(findMissingRequiredPresets(["react", "react-strict"])).toStrictEqual([])
  })
})
