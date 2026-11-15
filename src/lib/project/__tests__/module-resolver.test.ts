import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const TSC = join(import.meta.dirname, "../../../../node_modules/typescript/bin/tsc")

const PACKAGE = "node_modules/@company/config"

const decodeShowConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ compilerOptions: Schema.Struct({ outDir: Schema.String }) })
  )
)

/**
 * The `outDir` that `tsc --showConfig` reports for the project, from the base config that it
 * applies. Each base config sets `outDir` to its own path without `.json`, relative to its folder.
 */
function readAppliedBase(project: string) {
  const { status, stdout } = spawnSync("node", [TSC, "--showConfig"], {
    cwd: project,
    encoding: "utf8",
  })

  return { outDir: join(project, decodeShowConfig(stdout).compilerOptions.outDir), status }
}

describe("ModuleResolver.resolveConfig", () => {
  let project: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }

  // Each candidate base config names itself in `outDir`, so TypeScript shows which one it applies.
  function writeBase(file: string) {
    write(
      `${PACKAGE}/${file}`,
      JSON.stringify({ compilerOptions: { outDir: `./${basename(file, ".json")}` } })
    )
  }

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-module-resolver-")))
    write("src/index.ts", "export const value = 1\n")
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it.effect.each([
    {
      bases: ["tsconfig.json"],
      layout: "the package folder",
      manifest: {},
      specifier: "@company/config",
    },
    {
      bases: ["base.json"],
      layout: "an extensionless subpath",
      manifest: {},
      specifier: "@company/config/base",
    },
    {
      bases: ["tsconfig.json", "configs/strict.json"],
      layout: "the tsconfig field",
      manifest: { tsconfig: "./configs/strict.json" },
      specifier: "@company/config",
    },
    {
      bases: ["import.json", "require.json"],
      layout: "the require condition of exports",
      manifest: { exports: { "./base": { import: "./import.json", require: "./require.json" } } },
      specifier: "@company/config/base",
    },
  ])(
    "resolve $specifier through $layout to the base config that TypeScript applies",
    ({ bases, manifest, specifier }) =>
      Effect.gen(function* () {
        write(
          `${PACKAGE}/package.json`,
          yield* stringifyJson({ name: "@company/config", ...manifest })
        )
        bases.forEach(writeBase)
        write("tsconfig.json", yield* stringifyJson({ extends: specifier, include: ["src"] }))

        const resolver = yield* ModuleResolver
        const resolved = yield* resolver.resolveConfig(project, specifier)

        const { outDir, status } = readAppliedBase(project)

        expect({
          resolved: Option.map(resolved, (file) => file.replace(/\.json$/, "")),
          status,
        }).toStrictEqual({ resolved: Option.some(outDir), status: 0 })
      }).pipe(Effect.provide(ModuleResolver.layer))
  )
})
