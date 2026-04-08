import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"

const ROOT_DIR = join(import.meta.dir, "..", "..", "..", "..", "..")

describe("oxlint", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-oxlint-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("exists", () => {
    test("detect when no oxlint config exists", async () => {
      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(state).toEqual({
        active: null,
        legacy: [],
      })
    })

    test("report both configs and prefer oxlint.config.ts", async () => {
      await Bun.write(
        "oxlint.config.ts",
        'import { defineConfig } from "oxlint"\n\nexport default defineConfig({})\n'
      )
      await Bun.write(".oxlintrc.json", "{}")

      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(state.active).toEqual({
        format: "ts",
        path: join(tempDir, "oxlint.config.ts"),
      })
      expect(state.legacy).toEqual([
        {
          format: "json",
          path: join(tempDir, ".oxlintrc.json"),
        },
      ])
    })
  })

  describe("create", () => {
    test("create oxlint.config.ts with the correct config", async () => {
      await oxlint.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const state = await oxlint
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(state.active).toEqual({
        format: "ts",
        path: join(tempDir, "oxlint.config.ts"),
      })
      expect(state.legacy).toEqual([])

      const content = await Bun.file("oxlint.config.ts").text()
      expect(content).toContain('import { defineConfig } from "oxlint"')
      expect(content).toContain('import core from "adamantite/lint"')
      expect(content).toContain('"typeAware": true')
      expect(content).toContain('"typeCheck": true')
      expect(content).toContain("extends: [core]")
    })
  })

  describe("update", () => {
    test("patch oxlint.config.ts when type-aware options are missing", async () => {
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

      await oxlint.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file("oxlint.config.ts").text()
      expect(content).toContain("typeAware: true")
      expect(content).toContain("typeCheck: true")
      expect(content).toContain("extends: [core]")
    })

    test("leave oxlint.config.ts unchanged when type-aware options are already configured", async () => {
      const originalContent = [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        '  options: { "typeAware": true, "typeCheck": true },',
        "  extends: [core],",
        "})",
        "",
      ].join("\n")
      await Bun.write("oxlint.config.ts", originalContent)

      await oxlint.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(await Bun.file("oxlint.config.ts").text()).toBe(originalContent)
    })

    test("return FileNotFound when no oxlint config exists", async () => {
      const result = await runEither(oxlint.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FileNotFound" })
      }
    })

    test("fail when oxlint.config.ts cannot be patched safely", async () => {
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

      const result = await runEither(oxlint.update(tempDir), NodeServices.layer)
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "UnsupportedConfigState" })
      }
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.oxlint).toBe(oxlint.version)
    })
  })

  describe("assess", () => {
    test("report not applicable when no managed lint script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        applicable: false,
        warnings: [],
      })
    })

    test("report missing managed config when the managed check script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
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

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description: "Create `oxlint.config.ts` for `oxlint`.",
            path: "oxlint.config.ts",
            type: "create_config",
          },
        ],
        applicable: true,
        warnings: [],
      })
    })

    test("report a migration when a legacy config is active", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
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
      await Bun.write(".oxlintrc.json", JSON.stringify({ rules: { semi: "error" } }, null, 2))

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description: "Migrate legacy `.oxlintrc.json` to `oxlint.config.ts`.",
            migrationId: "legacy-oxlint-json",
            type: "run_migration",
          },
        ],
        applicable: true,
        warnings: [],
      })
    })

    test("report healthy when package and managed config are present", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
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
          '  options: { "typeAware": true, "typeCheck": true },',
          "  extends: [core],",
          "})",
          "",
        ].join("\n")
      )

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        applicable: true,
        warnings: [],
      })
    })

    test("report a config update when managed check config lacks type-aware options", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
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

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description:
              "Update `oxlint.config.ts` to enable `options.typeAware` and `options.typeCheck`.",
            path: "oxlint.config.ts",
            type: "update_config",
          },
        ],
        applicable: true,
        warnings: [],
      })
    })

    test("report a manual fix when managed check config cannot be patched safely", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
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

      const result = await oxlint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description:
              "Manually update `oxlint.config.ts` to enable `options.typeAware` and `options.typeCheck`; Adamantite cannot patch the current file shape safely.",
            path: "oxlint.config.ts",
            type: "manual_fix",
          },
        ],
        applicable: true,
        warnings: [],
      })
    })
  })
})

describe("tsgolint", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-tsgolint-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("assess", () => {
    test("report not applicable when no managed lint script exists", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              [tsgolint.name]: tsgolint.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const result = await tsgolint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        applicable: false,
        warnings: [],
      })
    })

    test("report missing package when the managed check script exists", async () => {
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

      const result = await tsgolint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [
          {
            description: `Install \`${tsgolint.name}@${tsgolint.version}\` for the managed lint scripts.`,
            package: tsgolint.name,
            targetVersion: tsgolint.version,
            type: "install_package",
          },
        ],
        applicable: true,
        warnings: [],
      })
    })

    test("report healthy when the package and managed lint script are present", async () => {
      await Bun.write(
        "package.json",
        JSON.stringify(
          {
            devDependencies: {
              [tsgolint.name]: tsgolint.version,
            },
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

      const result = await tsgolint
        .assess(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(result).toEqual({
        actions: [],
        applicable: true,
        warnings: [],
      })
    })
  })

  describe("version", () => {
    test("match the package.json devDependency", async () => {
      const packageJson = (await Bun.file(join(ROOT_DIR, "package.json")).json()) as PackageJson

      expect(packageJson.devDependencies?.["oxlint-tsgolint"]).toBe(tsgolint.version)
    })
  })
})
