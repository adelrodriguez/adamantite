import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/oxfmt/config.ts"
import { PACKAGE } from "#lib/integrations/oxfmt/index.ts"
import { assessPluginLanguages, pluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { readProject } from "#lib/project/project.ts"
import { formatJson } from "#lib/shared/json.ts"
import formatPreset from "#presets/format.ts"

const ROOT = "/project"

const REPO_ROOT = join(import.meta.dirname, "../../../../..")

const decodeOxfmtManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ peerDependenciesMeta: Schema.Record(Schema.String, Schema.Unknown) })
  )
)

// The optional peers of Oxfmt 0.78.0.
const OXFMT_PEERS = { "@astrojs/compiler-rs": "^0.5.0", svelte: "^5.0.0", "vite-plus": "*" }

interface Fixture {
  /**
   * The framework that `package.json` declares, with its specifier.
   */
  readonly declares: Readonly<Record<string, string>>
  /**
   * The packages installed in `node_modules`, with their versions. Oxfmt is one of them.
   */
  readonly installed: Readonly<Record<string, string>>
}

function assess({ declares, installed }: Fixture) {
  return Effect.gen(function* () {
    const files = createFileSystemTestContext({
      files: {
        ...Object.fromEntries(
          yield* Effect.forEach(
            Object.entries(installed),
            ([name, version]) =>
              formatJson(
                name === "oxfmt"
                  ? { name, peerDependencies: OXFMT_PEERS, version }
                  : { name, version }
              ).pipe(Effect.map((manifest) => [`node_modules/${name}/package.json`, manifest])),
            { concurrency: 1 }
          )
        ),
        "oxfmt.config.ts": toOxfmtTsConfigContent(),
        "package.json": yield* formatJson({
          devDependencies: { ...declares, oxfmt: PACKAGE.version },
          scripts: { check: "adamantite check" },
        }),
      },
      root: ROOT,
    })

    const packages = Object.fromEntries(
      Object.keys(installed).map((name) => [
        `${name}/package.json`,
        `node_modules/${name}/package.json`,
      ])
    )

    return yield* readProject(ROOT).pipe(
      Effect.flatMap(assessPluginLanguages),
      Effect.map((findings) => ({ findings })),
      Effect.provide(
        withConfigLoader(
          Layer.mergeAll(files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages))
        )
      )
    )
  })
}

describe("plugin languages", () => {
  it.effect("report an Astro project whose Oxfmt cannot load the Astro compiler", () =>
    Effect.gen(function* () {
      // Astro 6 depends on @astrojs/compiler, not on @astrojs/compiler-rs.
      const result = yield* assess({
        declares: { astro: "6.1.0" },
        installed: { astro: "6.1.0", oxfmt: "0.78.0" },
      })

      expect(result).toMatchObject({
        findings: [
          {
            currentState: expect.stringContaining("`@astrojs/compiler-rs` is not installed"),
            id: "unavailable-astro-plugin",
            integration: "oxfmt",
            title: "Oxfmt cannot format Astro files",
          },
        ],
      })
    })
  )

  it.effect("accept an Astro project whose Oxfmt loads a supported Astro compiler", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        declares: { astro: "7.4.11" },
        installed: { "@astrojs/compiler-rs": "0.5.3", astro: "7.4.11", oxfmt: "0.78.0" },
      })

      expect(result).toMatchObject({ findings: [] })
    })
  )

  it.effect("report a Svelte version outside the range that Oxfmt supports", () =>
    Effect.gen(function* () {
      // Svelte 4 resolves, but the Svelte plugin of Oxfmt needs the compiler of Svelte 5.
      const result = yield* assess({
        declares: { svelte: "^4.2.0" },
        installed: { oxfmt: "0.78.0", svelte: "4.2.20" },
      })

      expect(result).toMatchObject({
        findings: [
          {
            currentState: expect.stringContaining("`svelte` 4.2.20"),
            goal: expect.arrayContaining([expect.stringContaining("`svelte` ^5.0.0")]),
            id: "unavailable-svelte-plugin",
            title: "Oxfmt cannot format Svelte files",
          },
        ],
      })
    })
  )

  it.effect("accept a Svelte project in the range that Oxfmt supports", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        declares: { svelte: "^5.0.0" },
        installed: { oxfmt: "0.78.0", svelte: "5.57.3" },
      })

      expect(result).toMatchObject({ findings: [] })
    })
  )

  it.effect("report a Svelte version that does not parse", () =>
    Effect.gen(function* () {
      // A SemVer version has no `v` prefix.
      const result = yield* assess({
        declares: { svelte: "^5.0.0" },
        installed: { oxfmt: "0.78.0", svelte: "v5.0.0" },
      })

      expect(result).toMatchObject({
        findings: [
          {
            currentState: expect.stringContaining("`svelte` v5.0.0"),
            id: "unavailable-svelte-plugin",
            title: "Oxfmt cannot format Svelte files",
          },
        ],
      })
    })
  )

  it.effect("skip the plugin languages when Oxfmt is not installed", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        declares: { astro: "6.1.0", svelte: "^4.2.0" },
        installed: { svelte: "4.2.20" },
      })

      expect(result).toMatchObject({ findings: [] })
    })
  )
})

describe("plugin languages in the format preset", () => {
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
