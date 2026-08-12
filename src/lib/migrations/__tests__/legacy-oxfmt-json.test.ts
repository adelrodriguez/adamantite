import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createPrompterTestContext } from "#commands/__tests__/command-test-helpers.ts"
import migrationLegacyOxfmtJson from "#lib/migrations/legacy-oxfmt-json.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const prompterContext = createPrompterTestContext()
  const provided = effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, prompterContext.layer))
  ) as Effect.Effect<A, E>

  return Effect.runPromise(provided)
}

describe("legacyOxfmtJson", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-oxfmt-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check warns when both config formats exist and keeps the TS config active", async () => {
    await Bun.write("oxfmt.config.ts", "export default { semi: false }\n")
    await Bun.write(".oxfmtrc.json", "{}\n")

    const result = await runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
      ],
    })
  })

  test("migrate converts a legacy JSON config into the current TS config format", async () => {
    await Bun.write(
      ".oxfmtrc.json",
      JSON.stringify(
        {
          semi: true,
          sortImports: {
            order: "desc",
          },
        },
        null,
        2
      )
    )

    const checkResult = await runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `.oxfmtrc.json` configuration to `oxfmt.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("oxfmt.config.ts").exists()).toBe(true)
    expect(await Bun.file(".oxfmtrc.json").exists()).toBe(false)

    const content = await Bun.file("oxfmt.config.ts").text()
    expect(content).toContain('import format from "adamantite/format"')
    expect(content).toContain("  ...format,")
    expect(content).toContain("semi: true")
    expect(content).toContain("...format.sortImports")
    expect(content).toContain('order: "desc"')

    await runTestEffect(migrationLegacyOxfmtJson.validate({ cwd: tempDir }))
  })

  test("check warns when both legacy JSON and JSONC exist without a TS config", async () => {
    await Bun.write(".oxfmtrc.json", "{}\n")
    await Bun.write(".oxfmtrc.jsonc", '{ "semi": true }\n')

    const result = await runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "needed",
      summary: "Migrating legacy `.oxfmtrc.jsonc` configuration to `oxfmt.config.ts`.",
      warnings: [
        "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Multiple legacy oxfmt configs exist; Adamantite will treat `.oxfmtrc.jsonc` as the source of truth when migration is needed.",
      ],
    })
  })

  test("migrate removes both legacy files when JSON and JSONC exist without oxfmt.config.ts", async () => {
    await Bun.write(".oxfmtrc.json", '{ "semi": false }\n')
    await Bun.write(
      ".oxfmtrc.jsonc",
      JSON.stringify(
        {
          semi: true,
        },
        null,
        2
      )
    )

    await runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("oxfmt.config.ts").exists()).toBe(true)
    expect(await Bun.file(".oxfmtrc.json").exists()).toBe(false)
    expect(await Bun.file(".oxfmtrc.jsonc").exists()).toBe(false)

    const content = await Bun.file("oxfmt.config.ts").text()
    expect(content).toContain("semi: true")
  })

  test("migrate converts a legacy JSONC config with comments and trailing commas", async () => {
    await Bun.write(
      ".oxfmtrc.jsonc",
      [
        "{",
        "  // preserve me semantically",
        '  "semi": true,',
        '  "singleQuote": true,',
        "}",
        "",
      ].join("\n")
    )

    const checkResult = await runTestEffect(migrationLegacyOxfmtJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `.oxfmtrc.jsonc` configuration to `oxfmt.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyOxfmtJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("oxfmt.config.ts").exists()).toBe(true)
    expect(await Bun.file(".oxfmtrc.jsonc").exists()).toBe(false)

    const content = await Bun.file("oxfmt.config.ts").text()
    expect(content).toContain("semi: true")
    expect(content).toContain("singleQuote: true")
  })
})
