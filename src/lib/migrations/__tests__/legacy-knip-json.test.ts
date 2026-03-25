import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createPrompterTestContext } from "#commands/__tests__/command-test-helpers.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { legacyKnipJson } from "#lib/migrations/legacy-knip-json.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const prompterContext = createPrompterTestContext()
  const provided = effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, prompterContext.layer))
  ) as Effect.Effect<A, E>

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

    const layout = await runTestEffect(knip.exists(tempDir))
    const result = await runTestEffect(legacyKnipJson.check({ cwd: tempDir }))

    expect(result.status).toBe("valid")
    expect(result.warnings).toEqual(layout.warnings)
  })

  test("check warns when both legacy JSON and JSONC exist without a TS config", async () => {
    await Bun.write("knip.json", "{}\n")
    await Bun.write("knip.jsonc", '{ "entry": ["src/index.ts"] }\n')

    const layout = await runTestEffect(knip.exists(tempDir))
    const result = await runTestEffect(legacyKnipJson.check({ cwd: tempDir }))

    expect(result.status).toBe("needs_migration")
    expect(result.warnings).toEqual(layout.warnings)
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

    await runTestEffect(legacyKnipJson.migrate({ cwd: tempDir }))

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

    const checkResult = await runTestEffect(legacyKnipJson.check({ cwd: tempDir }))
    expect(checkResult.status).toBe("needs_migration")
    expect(checkResult.summary).toBe(
      "Migrating legacy `knip.json` configuration to `knip.config.ts`."
    )

    await runTestEffect(legacyKnipJson.migrate({ cwd: tempDir }))

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

    await runTestEffect(legacyKnipJson.validate({ cwd: tempDir }))
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

    const checkResult = await runTestEffect(legacyKnipJson.check({ cwd: tempDir }))
    expect(checkResult.status).toBe("needs_migration")
    expect(checkResult.summary).toBe(
      "Migrating legacy `knip.jsonc` configuration to `knip.config.ts`."
    )

    await runTestEffect(legacyKnipJson.migrate({ cwd: tempDir }))

    expect(await Bun.file("knip.config.ts").exists()).toBe(true)
    expect(await Bun.file("knip.jsonc").exists()).toBe(false)

    const content = await Bun.file("knip.config.ts").text()
    expect(content).toContain('"src/index.ts"')
    expect(content).toContain('"bunup.config.ts"')
  })
})
