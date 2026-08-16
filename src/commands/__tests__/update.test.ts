import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import updateCommand from "#commands/update.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import { MONOREPO_GUIDANCE } from "#lib/workspace/tsconfig.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

describe("update", () => {
  describe("dependency updates", () => {
    it.effect("report when everything is already current and skip installation", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "oxlint.config.ts": "export default {}\n",
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: knip.version,
                  oxfmt: oxfmt.version,
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                  sherif: sherif.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([])
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "No changes needed.",
        })
        expect(prompter.outros).toEqual(["✅ Adamantite is already up to date."])
      })
    )

    it.effect("install dependency updates automatically", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: "5.0.0",
                  oxfmt: "^0.34.0",
                  oxlint: "~1.49.0",
                  "oxlint-tsgolint": "workspace:^0.14.0",
                  sherif: "1.9.0",
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls).toEqual([])
        expect(installer.calls).toEqual([
          {
            options: { silent: true },
            packages: [
              `oxlint@${oxlint.version}`,
              `oxlint-tsgolint@${tsgolint.version}`,
              `oxfmt@${oxfmt.version}`,
              `sherif@${sherif.version}`,
              `knip@${knip.version}`,
            ],
          },
        ])
        expect(prompter.logs).toContainEqual({
          level: "info",
          message: "The following dependencies will be updated:",
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Dependencies updated successfully.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )

    it.effect(
      "leave missing managed configs for doctor when dependencies are already current",
      () =>
        Effect.gen(function* () {
          const files = createFileSystemTestContext({
            files: {
              "package.json": JSON.stringify(
                {
                  devDependencies: {
                    oxlint: oxlint.version,
                    "oxlint-tsgolint": tsgolint.version,
                  },
                  name: "test-project",
                  scripts: {
                    check: "adamantite check",
                  },
                  version: "1.0.0",
                },
                null,
                2
              ),
            },
          })

          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(updateCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(installer.calls).toEqual([])
          expect(files.exists("oxlint.config.ts")).toBe(false)
          expect(files.exists("tsconfig.json")).toBe(false)
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
          })
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message: "Doctor follow-up: Create `oxlint.config.ts` for `oxlint`.",
          })
          expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
        })
    )

    it.effect("update dependencies without creating missing managed configs", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: "1.49.0",
                },
                name: "test-project",
                scripts: {
                  check: "adamantite check",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([
          {
            options: { silent: true },
            packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
          },
        ])
        expect(files.exists("oxlint.config.ts")).toBe(false)
        expect(files.exists("tsconfig.json")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Dependencies updated successfully.",
        })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
        })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: "Doctor follow-up: Create `oxlint.config.ts` for `oxlint`.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )
  })

  describe("migrations", () => {
    it.effect("migrate a legacy knip config even when no dependency updates are needed", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "knip.jsonc": [
              "{",
              '  "entry": ["src/index.ts"],',
              '  "ignore": ["bunup.config.ts"],',
              "}",
              "",
            ].join("\n"),
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: knip.version,
                  oxfmt: oxfmt.version,
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                  sherif: sherif.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([])
        expect(files.exists("knip.jsonc")).toBe(false)

        const knipConfig = files.read("knip.config.ts")
        expect(knipConfig).toContain('import analyze from "adamantite/analyze"')
        expect(knipConfig).toContain('"src/index.ts"')
        expect(knipConfig).toContain('"bunup.config.ts"')
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Migrations ran successfully.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )

    it.effect("migrate a legacy oxfmt config even when no dependency updates are needed", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".oxfmtrc.jsonc": [
              "{",
              "  // keep semantic override",
              '  "semi": true,',
              '  "singleQuote": true,',
              "}",
              "",
            ].join("\n"),
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: knip.version,
                  oxfmt: oxfmt.version,
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                  sherif: sherif.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([])
        expect(files.exists(".oxfmtrc.jsonc")).toBe(false)

        const oxfmtConfig = files.read("oxfmt.config.ts")
        expect(oxfmtConfig).toContain('import format from "adamantite/format"')
        expect(oxfmtConfig).toContain("semi: true")
        expect(oxfmtConfig).toContain("singleQuote: true")
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Migrations ran successfully.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )

    it.effect("migrate a legacy oxlint config even when no dependency updates are needed", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".oxlintrc.json": JSON.stringify(
              {
                rules: {
                  semi: "error",
                },
              },
              null,
              2
            ),
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: knip.version,
                  oxfmt: oxfmt.version,
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                  sherif: sherif.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([])
        expect(files.exists(".oxlintrc.json")).toBe(false)

        const oxlintConfig = files.read("oxlint.config.ts")
        expect(oxlintConfig).toContain('"semi": "error"')
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Migrations ran successfully.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )

    it.effect(
      "migrate the legacy typecheck script to check and then install required dependencies",
      () =>
        Effect.gen(function* () {
          const files = createFileSystemTestContext({
            files: {
              "package.json": JSON.stringify(
                {
                  devDependencies: {
                    typescript: "5.0.0",
                  },
                  name: "test-project",
                  scripts: {
                    typecheck: "adamantite typecheck",
                  },
                  version: "1.0.0",
                },
                null,
                2
              ),
            },
          })

          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(updateCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(installer.calls).toEqual([
            {
              options: { silent: true },
              packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
            },
          ])

          // SAFETY: the fixture written above and the update migrations only ever
          // put string values under scripts.
          const packageJson = JSON.parse(files.read("package.json")) as {
            scripts: Record<string, string>
          }
          expect(packageJson.scripts).toEqual({
            check: "adamantite check",
          })

          expect(files.exists("oxlint.config.ts")).toBe(true)
          expect(files.exists("tsconfig.json")).toBe(true)
          expect(
            prompter.logs.filter((entry) => entry.level === "success").map((entry) => entry.message)
          ).toEqual(["Migrations ran successfully.", "Dependencies updated successfully."])
          expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
        })
    )

    it.effect("skip warning about a workflow that an earlier migration already regenerated", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".github/workflows/adamantite.yml":
              'name: adamantite\njobs:\n  verify:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: "26"\n',
            ".node-version": "22.19.0\n",
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                },
                name: "test-project",
                scripts: {
                  typecheck: "adamantite typecheck",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        // The typecheck migration adds the `check` script and regenerates the workflow, so the
        // node-version migration's check must see that state instead of warning from a stale one.
        const workflow = files.read(".github/workflows/adamantite.yml")
        expect(workflow).not.toContain('node-version: "26"')
        expect(prompter.logs).not.toContainEqual({
          level: "warning",
          message:
            "No CI-compatible managed scripts were found, so the GitHub Actions workflow was not updated.",
        })
      })
    )

    it.effect("surface migration warnings during a monorepo typecheck migration", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                },
                name: "test-project",
                scripts: {
                  typecheck: "adamantite typecheck",
                },
                version: "1.0.0",
                workspaces: ["packages/*"],
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(false)

        for (const message of MONOREPO_GUIDANCE) {
          expect(prompter.logs).toContainEqual({ level: "warning", message })
        }
      })
    )

    it.effect(
      "enable type-checked linting in an existing oxlint.config.ts during typecheck migration",
      () =>
        Effect.gen(function* () {
          const files = createFileSystemTestContext({
            files: {
              "oxlint.config.ts": [
                'import { defineConfig } from "oxlint"',
                'import core from "adamantite/lint"',
                "",
                "export default defineConfig({",
                "  extends: [core],",
                "})",
                "",
              ].join("\n"),
              "package.json": JSON.stringify(
                {
                  devDependencies: {
                    oxlint: oxlint.version,
                    "oxlint-tsgolint": tsgolint.version,
                    typescript: "5.0.0",
                  },
                  name: "test-project",
                  scripts: {
                    typecheck: "adamantite typecheck",
                  },
                  version: "1.0.0",
                },
                null,
                2
              ),
              "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }),
            },
          })

          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(updateCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)

          const oxlintConfig = files.read("oxlint.config.ts")
          expect(oxlintConfig).toContain("respectEslintDisableDirectives")
          expect(oxlintConfig).toContain("typeAware")
          expect(oxlintConfig).toContain("typeCheck")

          // SAFETY: the fixture written above and the update migrations only ever
          // put string values under scripts.
          const packageJson = JSON.parse(files.read("package.json")) as {
            scripts: Record<string, string>
          }
          expect(packageJson.scripts.check).toBe("adamantite check")
          expect(packageJson.scripts.typecheck).toBeUndefined()
          expect(prompter.logs).toContainEqual({
            level: "success",
            message: "Migrations ran successfully.",
          })
          expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
        })
    )

    it.effect("leave current-format oxlint config updates to doctor", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "oxlint.config.ts": [
              'import { defineConfig } from "oxlint"',
              'import core from "adamantite/lint"',
              "",
              "export default defineConfig({",
              "  extends: [core],",
              "})",
              "",
            ].join("\n"),
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                },
                name: "test-project",
                scripts: {
                  check: "adamantite check",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
            "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const oxlintConfig = files.read("oxlint.config.ts")
        expect(oxlintConfig).not.toContain("respectEslintDisableDirectives")
        expect(oxlintConfig).not.toContain("typeAware")
        expect(oxlintConfig).not.toContain("typeCheck")
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
        })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Doctor follow-up: Update `oxlint.config.ts` with Adamantite's required options.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )

    it.effect("skip update when oxlint.config.ts already has typeAware and typeCheck", () =>
      Effect.gen(function* () {
        const originalConfig = [
          'import { defineConfig } from "oxlint"',
          'import core from "adamantite/lint"',
          "",
          "export default defineConfig({",
          '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
          "  extends: [core],",
          "})",
          "",
        ].join("\n")
        const files = createFileSystemTestContext({
          files: {
            "oxlint.config.ts": originalConfig,
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                },
                name: "test-project",
                scripts: {
                  check: "adamantite check",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
            "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        expect(files.read("oxlint.config.ts")).toBe(originalConfig)
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "No changes needed.",
        })
        expect(prompter.outros).toEqual(["✅ Adamantite is already up to date."])
      })
    )

    it.effect("update an existing GitHub Actions workflow during typecheck migration", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".github/workflows/adamantite.yml":
              "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: check\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n",
            "oxlint.config.ts": "export default {}\n",
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxfmt: oxfmt.version,
                  oxlint: oxlint.version,
                  "oxlint-tsgolint": tsgolint.version,
                },
                name: "test-project",
                scripts: {
                  format: "adamantite format",
                  typecheck: "adamantite typecheck",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
            "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([])

        const workflow = files.read(".github/workflows/adamantite.yml")
        expect(workflow).toContain("name: check")
        expect(workflow).toContain("name: format")
        expect(workflow).not.toContain("name: types")
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Migrations ran successfully.",
        })
        expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
      })
    )
  })

  describe("warnings and errors", () => {
    it.effect("warn when both knip config formats are present and prefer knip.config.ts", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "knip.config.ts":
              'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n',
            "knip.json": JSON.stringify({ entry: ["src/main.ts"] }, null, 2),
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  knip: knip.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "No changes needed.",
        })
        expect(files.exists("knip.config.ts")).toBe(true)
        expect(files.exists("knip.json")).toBe(true)
      })
    )

    it.effect("warn when both oxfmt config formats are present and prefer oxfmt.config.ts", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".oxfmtrc.json": JSON.stringify({ semi: true }, null, 2),
            "oxfmt.config.ts":
              'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({ semi: false })\n',
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxfmt: oxfmt.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "No changes needed.",
        })
        expect(files.exists("oxfmt.config.ts")).toBe(true)
        expect(files.exists(".oxfmtrc.json")).toBe(true)
      })
    )

    it.effect("warn when both oxlint config formats are present and prefer oxlint.config.ts", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ".oxlintrc.json": JSON.stringify(
              {
                rules: {
                  semi: "error",
                },
              },
              null,
              2
            ),
            "oxlint.config.ts": 'export default { rules: { curly: "error" } }\n',
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: oxlint.version,
                },
                name: "test-project",
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "No changes needed.",
        })
        expect(files.exists("oxlint.config.ts")).toBe(true)
        expect(files.exists(".oxlintrc.json")).toBe(true)
      })
    )

    it.effect("fail when dependency installation fails", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "package.json": JSON.stringify(
              {
                devDependencies: {
                  oxlint: "1.49.0",
                },
                name: "test-project",
                scripts: {
                  check: "adamantite check",
                },
                version: "1.0.0",
              },
              null,
              2
            ),
          },
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext({
          addDevDependenciesError: new FailedToInstallDependency({
            packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
          }),
        })

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "FailedToInstallDependency" })
        expect(prompter.spinnerEntries).toContainEqual({
          message: "Failed to update dependencies",
          type: "stop",
        })
        expect(prompter.outros).toEqual(["❌ Update failed"])
      })
    )
  })
})
