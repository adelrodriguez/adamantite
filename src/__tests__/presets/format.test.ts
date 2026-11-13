import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import { pluginLanguages } from "#lib/integrations/tooling/oxfmt/languages.ts"
import formatPreset from "#presets/format.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const decodeOxfmtManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ peerDependenciesMeta: Schema.Record(Schema.String, Schema.Unknown) })
  )
)

const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })) })
  )
)

describe("format preset", () => {
  let project: string

  function format(source: string) {
    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxfmt"),
      ["--stdin-filepath", "index.ts"],
      { cwd: project, encoding: "utf8", input: source }
    )

    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)

    return result.stdout
  }

  function lint(source: string) {
    writeFileSync(join(project, "index.ts"), source)
    writeFileSync(
      join(project, "oxlint.config.ts"),
      `import core from ${JSON.stringify(CORE_PRESET)}\n\nexport default { extends: [core] }\n`
    )

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", "index.ts"],
      { cwd: project, encoding: "utf8" }
    )

    return decodeOxlintJsonOutput(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-format-"))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxfmt"), join(project, "node_modules/oxfmt"))
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it("load the config that init writes and apply the preset", () => {
    writeFileSync(
      join(project, "oxfmt.config.ts"),
      toOxfmtTsConfigContent().replace('"adamantite/format"', JSON.stringify(FORMAT_PRESET))
    )

    // The preset sets `semi: false`. Without it, Oxfmt keeps the semicolon.
    expect(format('const greeting = "hello";\n')).toBe('const greeting = "hello"\n')
  })

  it("write hex literals in a form that the core lint preset accepts", () => {
    writeFileSync(
      join(project, "oxfmt.config.ts"),
      toOxfmtTsConfigContent().replace('"adamantite/format"', JSON.stringify(FORMAT_PRESET))
    )

    const formatted = format("export const mask = 0xFFn\nexport const flag = 0xFF\n")

    // Oxfmt has no option for the case of hex digits, so it always writes them in lowercase.
    expect(formatted).toBe("export const mask = 0xffn\nexport const flag = 0xff\n")
    expect(lint(formatted)).toStrictEqual([])
  })

  it("turn on Oxfmt for each plugin language", () => {
    expect(pluginLanguages.filter(({ option }) => formatPreset[option] !== true)).toStrictEqual([])
  })

  // Oxfmt lists each package that a bundled plugin imports from the project as an optional peer.
  // `vite-plus` is the Vite+ config integration, not a plugin.
  it("list each package that an Oxfmt plugin imports", () => {
    const { peerDependenciesMeta } = decodeOxfmtManifest(
      readFileSync(join(REPO_ROOT, "node_modules/oxfmt/package.json"), "utf8")
    )

    const optionalPeers = Object.keys(peerDependenciesMeta).filter((name) => name !== "vite-plus")

    expect(
      EffectArray.sort(
        pluginLanguages.map(({ requires }) => requires),
        Order.String
      )
    ).toStrictEqual(EffectArray.sort(optionalPeers, Order.String))
  })
})
