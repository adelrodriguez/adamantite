import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import doctorCommand from "#commands/doctor.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

describe("doctor", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-doctor-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("report a compact no-op result when no integrations apply yet", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.intros).toEqual(["💠 adamantite doctor"])
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "No applicable integrations found.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("fail when adamantite is not installed in the project", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message:
        "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report missing oxfmt config as action needed when oxfmt is installed", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: "Needs attention: Create `oxfmt.config.ts` for `oxfmt`.",
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report no issues when the package and config are present", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(
      join(tempDir, "oxfmt.config.ts"),
      'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n'
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "No issues found.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("report missing oxlint config when the managed check script is present", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
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

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: "Needs attention: Create `oxlint.config.ts` for `oxlint`.",
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report missing knip config when the managed analyze script is present", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            knip: knip.version,
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: "Needs attention: Create `knip.config.ts` for `knip`.",
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report missing tsgolint package when managed linting is configured", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
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
    await writeFile(
      join(tempDir, "oxlint.config.ts"),
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

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: `Needs attention: Install \`${tsgolint.name}@${tsgolint.version}\` for the managed lint scripts.`,
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report missing sherif package when managed monorepo scripts are configured", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          scripts: {
            "check:monorepo": "adamantite monorepo",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: `Needs attention: Install \`${sherif.name}@${sherif.version}\` for the managed monorepo scripts.`,
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("report only issues when some integrations are already healthy", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(
      join(tempDir, "oxfmt.config.ts"),
      'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n'
    )

    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, [], [prompter.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(prompter.logs.filter((entry) => entry.level === "success")).toEqual([])
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: `Needs attention: Install \`knip@${knip.version}\` for the managed \`analyze\` script.`,
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })

  test("install fixable package issues with --fix", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
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
    await writeFile(
      join(tempDir, "oxlint.config.ts"),
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

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${tsgolint.name}@${tsgolint.version}`],
      },
    ])
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${tsgolint.name}@${tsgolint.version}\`.`,
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("update fixable package issues with --fix", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxlint: oxlint.version,
            [tsgolint.name]: "0.1.0",
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
    await writeFile(
      join(tempDir, "oxlint.config.ts"),
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

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${tsgolint.name}@${tsgolint.version}`],
      },
    ])
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: updated \`${tsgolint.name}\` from \`0.1.0\` to \`${tsgolint.version}\`.`,
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("fail cleanly when fixing dependencies fails", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
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
    await writeFile(
      join(tempDir, "oxlint.config.ts"),
      'import { defineConfig } from "oxlint"\n\nexport default defineConfig({})\n'
    )

    const installer = createDependencyInstallerTestContext({
      addDevDependenciesError: new FailedToInstallDependency({
        packages: [`${tsgolint.name}@${tsgolint.version}`],
      }),
    })
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
      _tag: "FailedToInstallDependency",
    })
    expect(prompter.outros).toEqual(["❌ Doctor failed"])
  })

  test("create oxfmt config with --fix when config creation is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `oxfmt.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("install oxfmt and create its config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${oxfmt.name}@${oxfmt.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${oxfmt.name}@${oxfmt.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `oxfmt.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("migrate legacy oxfmt config with --fix when migration is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: false }, null, 2))

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, ".oxfmtrc.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `.oxfmtrc.json` to `oxfmt.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("fail cleanly when a migration fix fails", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxfmt: oxfmt.version,
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify([], null, 2))

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])
    const error = Option.getOrThrow(Exit.findErrorOption(exit))
    const errorPath =
      typeof error === "object" &&
      error !== null &&
      "path" in error &&
      typeof error.path === "string"
        ? error.path
        : ""

    expect(Exit.isFailure(exit)).toBe(true)
    expect(error).toMatchObject({ _tag: "InvalidConfigFormat" })
    expect(errorPath).toEndWith("/.oxfmtrc.json")
    expect(prompter.outros).toEqual(["❌ Doctor failed"])
  })

  test("install oxfmt and migrate its legacy config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          scripts: {
            format: "adamantite format",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: false }, null, 2))

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${oxfmt.name}@${oxfmt.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, ".oxfmtrc.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${oxfmt.name}@${oxfmt.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `.oxfmtrc.json` to `oxfmt.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("create knip config with --fix when config creation is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            knip: knip.version,
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `knip.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("install knip and create its config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${knip.name}@${knip.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${knip.name}@${knip.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `knip.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("migrate legacy knip config with --fix when migration is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            knip: knip.version,
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(
      join(tempDir, "knip.json"),
      JSON.stringify({ entry: ["src/index.ts"] }, null, 2)
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, "knip.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `knip.json` to `knip.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("install knip and migrate its legacy config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
          },
          name: "test-project",
          scripts: {
            analyze: "adamantite analyze",
          },
          version: "1.0.0",
        },
        null,
        2
      )
    )
    await writeFile(
      join(tempDir, "knip.json"),
      JSON.stringify({ entry: ["src/index.ts"] }, null, 2)
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${knip.name}@${knip.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, "knip.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${knip.name}@${knip.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `knip.json` to `knip.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("create oxlint config with --fix when config creation is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxlint: oxlint.version,
            [tsgolint.name]: tsgolint.version,
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

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `oxlint.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("install oxlint and create its config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            [tsgolint.name]: tsgolint.version,
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

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${oxlint.name}@${oxlint.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${oxlint.name}@${oxlint.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: created `oxlint.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("migrate legacy oxlint config with --fix when migration is the only issue", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxlint: oxlint.version,
            [tsgolint.name]: tsgolint.version,
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
    await writeFile(
      join(tempDir, ".oxlintrc.json"),
      JSON.stringify({ rules: { semi: "error" } }, null, 2)
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `.oxlintrc.json` to `oxlint.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("install oxlint and migrate its legacy config with --fix when both are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            [tsgolint.name]: tsgolint.version,
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
    await writeFile(
      join(tempDir, ".oxlintrc.json"),
      JSON.stringify({ rules: { semi: "error" } }, null, 2)
    )

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([
      {
        options: { silent: true },
        packages: [`${oxlint.name}@${oxlint.version}`],
      },
    ])
    expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(false)
    expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: `Fixed: installed \`${oxlint.name}@${oxlint.version}\`.`,
    })
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: Migrate legacy `.oxlintrc.json` to `oxlint.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("patch oxlint config with --fix when type-aware options are missing", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxlint: oxlint.version,
            [tsgolint.name]: tsgolint.version,
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
    await writeFile(
      join(tempDir, "oxlint.config.ts"),
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

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    const oxlintConfig = await Bun.file(join(tempDir, "oxlint.config.ts")).text()
    expect(oxlintConfig).toContain("respectEslintDisableDirectives: true")
    expect(oxlintConfig).toContain("typeAware: true")
    expect(oxlintConfig).toContain("typeCheck: true")
    expect(prompter.logs).toContainEqual({
      level: "success",
      message: "Fixed: updated `oxlint.config.ts`.",
    })
    expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
  })

  test("report manual oxlint config drift with --fix when the file cannot be patched safely", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          devDependencies: {
            adamantite: "1.0.0",
            oxlint: oxlint.version,
            [tsgolint.name]: tsgolint.version,
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
    const originalConfig = [
      'import { defineConfig } from "oxlint"',
      "",
      "export default defineConfig({",
      "  options: getOptions(),",
      "})",
      "",
    ].join("\n")
    await writeFile(join(tempDir, "oxlint.config.ts"), originalConfig)

    const installer = createDependencyInstallerTestContext()
    const prompter = createPrompterTestContext()

    const exit = await runCommand(doctorCommand, ["--fix"], [prompter.layer, installer.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    expect(installer.calls).toEqual([])
    expect(await Bun.file(join(tempDir, "oxlint.config.ts")).text()).toBe(originalConfig)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message:
        "Needs attention: Manually update `oxlint.config.ts` with Adamantite's required options; Adamantite cannot patch the current file shape safely.",
    })
    expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
  })
})
