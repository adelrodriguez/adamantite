import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import { formatJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

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
          devDependencies: { ...declares, oxfmt: oxfmt.version },
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
      Effect.flatMap((project) => oxfmt.assess(project)),
      Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT, packages)])
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
        applicable: true,
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

      expect(result).toMatchObject({ applicable: true, findings: [] })
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
        applicable: true,
        findings: [
          {
            currentState: expect.stringContaining("`svelte` 4.2.20"),
            goal: [expect.stringContaining("`svelte` ^5.0.0")],
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

      expect(result).toMatchObject({ applicable: true, findings: [] })
    })
  )

  it.effect("leave the plugin packages to package assessment when Oxfmt is missing", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        declares: { astro: "6.1.0", svelte: "^4.2.0" },
        installed: { svelte: "4.2.20" },
      })

      expect(result.applicable && result.findings.map(({ id }) => id)).toStrictEqual([
        "missing-oxfmt",
      ])
    })
  )
})
