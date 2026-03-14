import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { createPrompterTestContext } from "#commands/__tests__/command-test-helpers.ts"
import { oxlintTypecheck } from "#lib/migrations/oxlint-typecheck.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const prompterContext = createPrompterTestContext()
  const provided = effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, prompterContext.layer))
  ) as Effect.Effect<A, E>
  return Effect.runPromise(provided)
}

describe("oxlintTypecheck", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-oxlint-typecheck-migration-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("check reports a migration for managed lint scripts with missing type-check options", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        "  extends: [core],",
        "})",
        "",
      ].join("\n")
    )

    const result = await runTestEffect(oxlintTypecheck.check({ cwd: tempDir }))

    expect(result.status).toBe("needs_migration")
  })

  test("check skips oxlint configs when lint scripts are not managed", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write("oxlint.config.ts", "export default {}\n")

    const result = await runTestEffect(oxlintTypecheck.check({ cwd: tempDir }))

    expect(result.status).toBe("not_applicable")
  })

  test("migrate adds missing type-check options to an exported config object", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            typecheck: "adamantite typecheck",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write("oxlint.config.ts", "export default {}\n")

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))
    await runTestEffect(oxlintTypecheck.validate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
  })

  test("migrate updates an existing options object without dropping unrelated settings", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        "  options: {",
        "    jsxPlugin: true,",
        "    typeAware: false,",
        "  },",
        "  extends: [core],",
        "})",
        "",
      ].join("\n")
    )

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toContain("jsxPlugin: true")
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
  })

  test("migrate adds missing type-check options to a direct exported object literal", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write("oxlint.config.ts", ["export default {", "  extends: [],", "}", ""].join("\n"))

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toContain("options: {")
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
  })

  test("migrate inserts only the missing required option", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            fix: "adamantite fix",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: {",
        "    typeAware: true,",
        "    jsxPlugin: true,",
        "  },",
        "})",
        "",
      ].join("\n")
    )

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
    expect(oxlintConfig.match(/typeAware: true/g)?.length).toBe(1)
  })

  test("migrate leaves an already configured file unchanged", async () => {
    const originalConfig = [
      'import { defineConfig } from "oxlint"',
      "",
      "export default defineConfig({",
      '  options: { "typeAware": true, "typeCheck": true },',
      "  extends: [],",
      "})",
      "",
    ].join("\n")

    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write("oxlint.config.ts", originalConfig)

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toBe(originalConfig)
  })

  test("check warns when required options use non-boolean values", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: {",
        "    typeAware: computeValue(),",
        "  },",
        "})",
        "",
      ].join("\n")
    )

    const result = await runTestEffect(oxlintTypecheck.check({ cwd: tempDir }))

    expect(result.status).toBe("needs_migration")
    expect(result.warnings).toEqual([
      "Adamantite found an `oxlint.config.ts` that still needs `typeAware` and `typeCheck`, but the file shape is not supported for automatic patching. The migration will stop and ask for a manual fix.",
    ])
  })

  test("migrate ignores braces in strings and comments when patching top-level options", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        '  note: "keep { this } string",',
        "  // comment with } that should be ignored",
        "  options: {",
        "    typeAware: false,",
        '    message: "inner { brace }",',
        "  },",
        "})",
        "",
      ].join("\n")
    )

    await runTestEffect(oxlintTypecheck.migrate({ cwd: tempDir }))

    const oxlintConfig = await Bun.file("oxlint.config.ts").text()
    expect(oxlintConfig).toContain('note: "keep { this } string"')
    expect(oxlintConfig).toContain('message: "inner { brace }"')
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
  })

  test("migrate fails for unsupported options shapes", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: getOptions(),",
        "})",
        "",
      ].join("\n")
    )

    const result = await runEither(
      oxlintTypecheck.migrate({ cwd: tempDir }),
      Layer.merge(NodeServices.layer, createPrompterTestContext().layer)
    )

    expect(isLeft(result)).toBe(true)
  })

  test("migrate fails for non-boolean required options", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: {",
        "    typeCheck: someVariable,",
        "  },",
        "})",
        "",
      ].join("\n")
    )

    const result = await runEither(
      oxlintTypecheck.migrate({ cwd: tempDir }),
      Layer.merge(NodeServices.layer, createPrompterTestContext().layer)
    )

    expect(isLeft(result)).toBe(true)
  })

  test("migrate fails for duplicate options properties", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: {},",
        "  options: {},",
        "})",
        "",
      ].join("\n")
    )

    const result = await runEither(
      oxlintTypecheck.migrate({ cwd: tempDir }),
      Layer.merge(NodeServices.layer, createPrompterTestContext().layer)
    )

    expect(isLeft(result)).toBe(true)
  })

  test("migrate fails for duplicate required option properties", async () => {
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          scripts: {
            check: "adamantite check",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await Bun.write(
      "oxlint.config.ts",
      [
        'import { defineConfig } from "oxlint"',
        "",
        "export default defineConfig({",
        "  options: {",
        "    typeAware: true,",
        "    typeAware: false,",
        "  },",
        "})",
        "",
      ].join("\n")
    )

    const result = await runEither(
      oxlintTypecheck.migrate({ cwd: tempDir }),
      Layer.merge(NodeServices.layer, createPrompterTestContext().layer)
    )

    expect(isLeft(result)).toBe(true)
  })
})
