import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { pluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import formatPreset from "#presets/format.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../../..")

const decodeOxfmtManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ peerDependenciesMeta: Schema.Record(Schema.String, Schema.Unknown) })
  )
)

describe("format preset", () => {
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
