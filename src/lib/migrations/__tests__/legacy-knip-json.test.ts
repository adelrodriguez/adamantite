import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import migrationLegacyKnipJson from "#lib/migrations/legacy-knip-json.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const provided = effect.pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>

  return Effect.runPromise(provided)
}

describe("legacyKnipJson", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-legacy-knip-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check warns when both config formats exist and keeps the TS config active", async () => {
    await Bun.write("knip.config.ts", "export default {}\n")
    await Bun.write("knip.json", "{}\n")

    const result = await runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "not-applicable",
      warnings: [
        "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
      ],
    })
  })

  test("check warns when both legacy JSON and JSONC exist without a TS config", async () => {
    await Bun.write("knip.json", "{}\n")
    await Bun.write("knip.jsonc", '{ "entry": ["src/index.ts"] }\n')

    const result = await runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))

    expect(result).toEqual({
      status: "needed",
      summary: "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`.",
      warnings: [
        "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed.",
      ],
    })
  })

  test("migrate removes both legacy files when JSON and JSONC exist without knip.config.ts", async () => {
    await Bun.write("knip.json", '{ "entry": ["src/other.ts"] }\n')
    await Bun.write(
      "knip.jsonc",
      JSON.stringify(
        {
          entry: ["src/index.ts"],
          ignore: ["bunup.config.ts"],
        },
        null,
        2
      )
    )

    await runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("knip.config.ts").exists()).toBe(true)
    expect(await Bun.file("knip.json").exists()).toBe(false)
    expect(await Bun.file("knip.jsonc").exists()).toBe(false)

    const content = await Bun.file("knip.config.ts").text()
    expect(content).toContain('"src/index.ts"')
    expect(content).not.toContain("src/other.ts")
  })

  test("migrate converts a legacy JSON config into the current TS config format", async () => {
    await Bun.write(
      "knip.json",
      JSON.stringify(
        {
          entry: ["src/main.ts"],
          ignore: ["bunup.config.ts"],
          rules: {
            devDependencies: "off",
          },
        },
        null,
        2
      )
    )

    const checkResult = await runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `knip.json` configuration to `knip.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("knip.config.ts").exists()).toBe(true)
    expect(await Bun.file("knip.json").exists()).toBe(false)

    const content = await Bun.file("knip.config.ts").text()
    expect(content).toContain('import analyze from "adamantite/analyze"')
    expect(content).toContain("  ...analyze,")
    expect(content).toContain("    ...analyze.rules,")
    expect(content).toContain("entry: [")
    expect(content).toContain('"src/main.ts"')
    expect(content).toContain('"bunup.config.ts"')
    expect(content).toContain('devDependencies: "off"')

    await runTestEffect(migrationLegacyKnipJson.validate({ cwd: tempDir }))
  })

  test("migrate converts a legacy JSONC config with comments and trailing commas", async () => {
    await Bun.write(
      "knip.jsonc",
      [
        "{",
        "  // preserve semantic override",
        '  "entry": ["src/index.ts"],',
        '  "ignore": ["bunup.config.ts"],',
        "}",
        "",
      ].join("\n")
    )

    const checkResult = await runTestEffect(migrationLegacyKnipJson.check({ cwd: tempDir }))
    expect(checkResult).toEqual({
      status: "needed",
      summary: "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`.",
      warnings: [],
    })

    await runTestEffect(migrationLegacyKnipJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("knip.config.ts").exists()).toBe(true)
    expect(await Bun.file("knip.jsonc").exists()).toBe(false)

    const content = await Bun.file("knip.config.ts").text()
    expect(content).toContain('"src/index.ts"')
    expect(content).toContain('"bunup.config.ts"')
  })
})
