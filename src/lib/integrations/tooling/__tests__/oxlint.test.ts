import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"

layer(NodeServices.layer)("oxlint", (it) => {
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

  describe("detect", () => {
    it.effect("detect when no oxlint config exists", () =>
      Effect.gen(function* () {
        const state = yield* oxlint.detect(tempDir)

        expect(state).toEqual({
          active: null,
          legacy: [],
          warnings: [],
        })
      })
    )

    it.effect("report both configs and prefer oxlint.config.ts", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            "oxlint.config.ts",
            'import { defineConfig } from "oxlint"\n\nexport default defineConfig({})\n'
          )
        )
        yield* Effect.promise(() => writeFile(".oxlintrc.json", "{}"))

        const state = yield* oxlint.detect(tempDir)

        expect(state.active).toEqual({
          file: "oxlint.config.ts",
          format: "ts",
          path: join(tempDir, "oxlint.config.ts"),
        })
        expect(state.legacy).toEqual([
          {
            file: ".oxlintrc.json",
            format: "json",
            path: join(tempDir, ".oxlintrc.json"),
          },
        ])
      })
    )
  })

  describe("create", () => {
    it.effect("create oxlint.config.ts with the correct config", () =>
      Effect.gen(function* () {
        yield* oxlint.create(tempDir)

        const state = yield* oxlint.detect(tempDir)
        expect(state.active).toEqual({
          file: "oxlint.config.ts",
          format: "ts",
          path: join(tempDir, "oxlint.config.ts"),
        })
        expect(state.legacy).toEqual([])

        const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
        expect(content).toContain('import { defineConfig } from "oxlint"')
        expect(content).toContain('import core from "adamantite/lint"')
        expect(content).toContain('"respectEslintDisableDirectives": true')
        expect(content).toContain('"typeAware": true')
        expect(content).toContain('"typeCheck": true')
        expect(content).toContain("ignorePatterns: core.ignorePatterns")
        expect(content).toContain("extends: [core]")
      })
    )

    it.effect("create oxlint.config.ts with selected presets", () =>
      Effect.gen(function* () {
        yield* oxlint.create(tempDir, ["antislop"])

        const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
        expect(content).toContain('import core from "adamantite/lint"')
        expect(content).toContain('import antislop from "adamantite/lint/antislop"')
        expect(content).toContain("extends: [core, antislop]")
      })
    )
  })

  describe("update", () => {
    it.effect("patch oxlint.config.ts when type-aware options are missing", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* oxlint.update(tempDir)

        const content = yield* Effect.promise(() => testFile("oxlint.config.ts").text())
        expect(content).toContain("respectEslintDisableDirectives: true")
        expect(content).toContain("typeAware: true")
        expect(content).toContain("typeCheck: true")
        expect(content).toContain("extends: [core]")
      })
    )

    it.effect(
      "leave oxlint.config.ts unchanged when type-aware options are already configured",
      () =>
        Effect.gen(function* () {
          const originalContent = [
            'import { defineConfig } from "oxlint"',
            'import core from "adamantite/lint"',
            "",
            "export default defineConfig({",
            '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
            "  extends: [core],",
            "})",
            "",
          ].join("\n")
          yield* Effect.promise(() => writeFile("oxlint.config.ts", originalContent))
          yield* oxlint.update(tempDir)

          expect(yield* Effect.promise(() => testFile("oxlint.config.ts").text())).toBe(
            originalContent
          )
        })
    )

    it.effect("return FileNotFound when no oxlint config exists", () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(oxlint.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FileNotFound" })
        }
      })
    )

    it.effect("fail when oxlint.config.ts cannot be patched safely", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* Effect.result(oxlint.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "UnsupportedConfigState" })
        }
      })
    )
  })

  describe("assess", () => {
    it.effect("report not applicable when no managed lint script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxlint.assess(tempDir)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing managed config when the managed check script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxlint.assess(tempDir)

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
    )

    it.effect("report a migration when a legacy config is active", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(".oxlintrc.json", JSON.stringify({ rules: { semi: "error" } }, null, 2))
        )

        const result = yield* oxlint.assess(tempDir)

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
    )

    it.effect("report healthy when package and managed config are present", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
            "oxlint.config.ts",
            [
              'import { defineConfig } from "oxlint"',
              'import core from "adamantite/lint"',
              "",
              "export default defineConfig({",
              '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
              "  extends: [core],",
              "})",
              "",
            ].join("\n")
          )
        )

        const result = yield* oxlint.assess(tempDir)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report a config update when managed check config lacks type-aware options", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxlint.assess(tempDir)

        expect(result).toEqual({
          actions: [
            {
              description: "Update `oxlint.config.ts` with Adamantite's required options.",
              path: "oxlint.config.ts",
              type: "update_config",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )

    it.effect("report a manual fix when managed check config cannot be patched safely", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* oxlint.assess(tempDir)

        expect(result).toEqual({
          actions: [
            {
              description:
                "Manually update `oxlint.config.ts` with Adamantite's required options; Adamantite cannot patch the current file shape safely.",
              path: "oxlint.config.ts",
              type: "manual_fix",
            },
          ],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})

layer(NodeServices.layer)("tsgolint", (it) => {
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
    it.effect("report not applicable when no managed lint script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* tsgolint.assess(tempDir)

        expect(result).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report missing package when the managed check script exists", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* tsgolint.assess(tempDir)

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
    )

    it.effect("report healthy when the package and managed lint script are present", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const result = yield* tsgolint.assess(tempDir)

        expect(result).toEqual({
          actions: [],
          applicable: true,
          warnings: [],
        })
      })
    )
  })
})
