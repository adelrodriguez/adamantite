import { describe, expect, it } from "vitest"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

const options = { moduleName: "adamantite/analyze", presetName: "Adamantite analyze" }

describe("inspectRequiredPresetConfig", () => {
  it("accept a direct preset export", () => {
    expect(
      inspectRequiredPresetConfig(
        'import analyze from "adamantite/analyze"\nexport default analyze\n',
        options
      )
    ).toEqual({ kind: "configured" })
  })

  it("accept a preset used by an exported variable", () => {
    expect(
      inspectRequiredPresetConfig(
        'import analyze from "adamantite/analyze"\nconst config = { ...analyze, entry: ["src/index.ts"] }\nexport default config\n',
        options
      )
    ).toEqual({ kind: "configured" })
  })

  it("reject an unused preset import", () => {
    expect(
      inspectRequiredPresetConfig(
        'import analyze from "adamantite/analyze"\nexport default {}\n',
        options
      )
    ).toMatchObject({ kind: "invalid" })
  })

  it("reject a comment that only names the unused preset", () => {
    expect(
      inspectRequiredPresetConfig(
        'import analyze from "adamantite/analyze"\nexport default {}\n// analyze\n',
        options
      )
    ).toMatchObject({ kind: "invalid" })
  })
})
