import process from "node:process"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Command from "effect/unstable/cli/Command"
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { FailedToWriteFile, NoPackageManager, UnknownScript } from "#lib/shared/errors.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import {
  checkIsSupportedPackageManager,
  readPackageJson,
  type Script,
  type SupportedPackageManager,
} from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

const installDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    const dependencyInstaller = yield* DependencyInstaller
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Installing dependencies...")
    const isMonorepo = yield* checkIsMonorepo(cwd)

    yield* dependencyInstaller
      .addDevDependencies(packages, cwd, {
        silent: true,
        workspace: isMonorepo,
      })
      .pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            spinner.stop("Failed to install dependencies.")
          })
        )
      )

    spinner.stop("Dependencies installed.")
  })

function logLegacyConfigPreservedMessage(tool: string, configPath: string) {
  return Effect.gen(function* () {
    const prompter = yield* Prompter

    // TODO: Point users to `adamantite doctor` / `adamantite doctor --fix` once doctor lands.
    yield* prompter.log.info(
      `Legacy \`${configPath}\` was preserved during \`adamantite init\`. \`adamantite init\` does not migrate legacy ${tool} configs yet.`
    )
  })
}

const setupOxlintConfig = (cwd: string, presets: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up oxlint config...")

    const exists = yield* oxlint.exists(cwd)
    const oxlintLegacyConfig = oxlint.files[1].path

    if (exists.active?.format === "ts" && exists.legacy.length > 0) {
      yield* prompter.log.warning(
        `Found both \`${oxlint.config}\` and \`${oxlintLegacyConfig}\`. Adamantite will use \`${oxlint.config}\`.`
      )
    }

    if (exists.active?.format === "json") {
      spinner.message(`Found \`${oxlintLegacyConfig}\`, keeping existing config.`)

      spinner.stop("oxlint config is ready.")
      yield* logLegacyConfigPreservedMessage("oxlint", oxlintLegacyConfig)
    } else if (exists.active?.format === "ts") {
      spinner.message(`Found \`${oxlint.config}\`, keeping existing config.`)

      spinner.stop("oxlint config is ready.")
    } else {
      spinner.message(`\`${oxlint.config}\` not found, creating...`)

      yield* oxlint.create(cwd, presets)

      spinner.stop("oxlint config created successfully.")
    }
  })

const setupOxfmtConfig = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up oxfmt config...")

    const exists = yield* oxfmt.exists(cwd)

    if (exists.active?.format === "ts" && exists.legacy.length > 0) {
      yield* prompter.log.warning(
        `Found both \`${oxfmt.config}\` and \`.oxfmtrc.json(c)\`. Adamantite will use \`${oxfmt.config}\`.`
      )
    }

    if (exists.active && exists.active.format !== "ts" && exists.legacy.length > 0) {
      yield* prompter.log.warning(
        "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Multiple legacy oxfmt configs exist; Adamantite will treat `.oxfmtrc.jsonc` as the source of truth when migration is needed."
      )
    }

    if (exists.active?.format === "json" || exists.active?.format === "jsonc") {
      const legacyConfigFile = exists.active.path.endsWith(oxfmt.files[1].path)
        ? oxfmt.files[1].path
        : oxfmt.files[2].path

      spinner.message(`Found \`${legacyConfigFile}\`, keeping existing config.`)

      spinner.stop("oxfmt config is ready.")
      yield* logLegacyConfigPreservedMessage("oxfmt", legacyConfigFile)
    } else if (exists.active?.format === "ts") {
      spinner.message(`Found \`${oxfmt.config}\`, keeping existing config.`)

      spinner.stop("oxfmt config is ready.")
    } else {
      spinner.message(`\`${oxfmt.config}\` not found, creating...`)

      yield* oxfmt.create(cwd)

      spinner.stop("oxfmt config created successfully.")
    }
  })

const addScripts = (cwd: string, scripts: Script[]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const prompter = yield* Prompter
    const packageJson = yield* readPackageJson(cwd)
    const spinner = prompter.spinner()
    spinner.start("Adding scripts to your `package.json`...")

    packageJson.scripts ??= {}

    for (const script of scripts) {
      switch (script) {
        case "check":
          packageJson.scripts.check = "adamantite check"
          break
        case "fix":
          packageJson.scripts.fix = "adamantite fix"
          break
        case "format":
          packageJson.scripts.format = "adamantite format"
          break
        case "check:monorepo":
          packageJson.scripts["check:monorepo"] = "adamantite monorepo"
          break
        case "fix:monorepo":
          packageJson.scripts["fix:monorepo"] = "adamantite monorepo --fix"
          break
        case "analyze":
          packageJson.scripts.analyze = "adamantite analyze"
          break
        default:
          return yield* new UnknownScript({ script })
      }
    }

    const packagePath = path.join(cwd, "package.json")
    yield* fs
      .writeFileString(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: packagePath })))

    spinner.stop("Scripts added to your `package.json`")
  })

const setupKnipConfig = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up knip config...")

    const exists = yield* knip.exists(cwd)

    if (exists.active?.format === "ts" && exists.legacy.length > 0) {
      yield* prompter.log.warning(
        `Found both \`${knip.config}\` and \`knip.json(c)\`. Adamantite will use \`${knip.config}\`.`
      )
    }

    if (exists.active && exists.active.format !== "ts" && exists.legacy.length > 0) {
      yield* prompter.log.warning(
        "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed."
      )
    }

    if (exists.active?.format === "json" || exists.active?.format === "jsonc") {
      const legacyConfigFile = exists.active.path.endsWith(knip.files[1].path)
        ? knip.files[1].path
        : knip.files[2].path

      spinner.message(`Found \`${legacyConfigFile}\`, keeping existing config.`)

      spinner.stop("knip config is ready.")
      yield* logLegacyConfigPreservedMessage("knip", legacyConfigFile)
    } else if (exists.active?.format === "ts") {
      spinner.message(`Found \`${knip.config}\`, keeping existing config.`)

      spinner.stop("knip config is ready.")
    } else {
      spinner.message(`\`${knip.config}\` not found, creating...`)

      yield* knip.create(cwd)

      spinner.stop("knip config created successfully.")
    }
  })

const setupTypescript = (cwd: string) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up TypeScript config...")

    const typescriptExists = yield* tsconfig.exists(cwd)

    if (typescriptExists) {
      spinner.message(`\`${tsconfig.config}\` found, updating...`)

      yield* tsconfig.update(cwd)

      spinner.stop(`\`${tsconfig.config}\` updated successfully`)
    } else {
      spinner.message(`\`${tsconfig.config}\` not found, creating...`)

      yield* tsconfig.create(cwd)

      spinner.stop(`\`${tsconfig.config}\` created successfully`)
    }
  })

const setupEditors = (cwd: string, editors: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    if (editors.includes("vscode")) {
      const spinner = prompter.spinner()

      spinner.start(`Checking for \`${vscode.config}\`...`)

      const hasVscodeSettings = yield* vscode.exists(cwd)
      if (hasVscodeSettings) {
        spinner.message(`\`${vscode.config}\` found, updating...`)
        yield* vscode.update(cwd)
        spinner.stop(`\`${vscode.config}\` updated with Adamantite preset.`)
      } else {
        spinner.message(`\`${vscode.config}\` not found, creating...`)
        yield* vscode.create(cwd)
        spinner.stop(`\`${vscode.config}\` created with Adamantite preset.`)
      }
    }

    if (editors.includes("zed")) {
      const spinner = prompter.spinner()

      spinner.start(`Checking for \`${zed.config}\`...`)

      const hasZedSettings = yield* zed.exists(cwd)
      if (hasZedSettings) {
        spinner.message(`\`${zed.config}\` found, updating...`)
        yield* zed.update(cwd)
        spinner.stop(`\`${zed.config}\` updated with Adamantite preset.`)
      } else {
        spinner.message(`\`${zed.config}\` not found, creating...`)
        yield* zed.create(cwd)
        spinner.stop(`\`${zed.config}\` created with Adamantite preset.`)
      }
    }
  })

const installEditorExtensions = (editors: string[], scripts: Script[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Installing editor extensions...")
    const hasZed = editors.includes("zed")
    const hasVscode = editors.includes("vscode")

    const result = yield* Effect.gen(function* () {
      if (editors.includes("vscode")) {
        spinner.message("Installing VS Code extension...")
        yield* vscode.extension(scripts)
      }

      return true as const
    }).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          spinner.stop()
        })
      ),
      Effect.catchTag("FailedToInstallExtension", (error) =>
        Effect.gen(function* () {
          yield* prompter.log.warning(`⚠️ Failed to install the \`${error.extension}\` extension.`)
          yield* prompter.log.warning("Please install it manually after setup completes.")
          return false as const
        })
      ),
      Effect.catchTag("VscodeCliNotFound", () =>
        Effect.gen(function* () {
          yield* prompter.log.error("VSCode CLI ('code' command) not found.")
          yield* prompter.log.info("To install it:")
          yield* prompter.log.info("  1. Open VS Code")
          yield* prompter.log.info("  2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)")
          yield* prompter.log.info("  3. Run 'Shell Command: Install \"code\" command in PATH'")
          return false as const
        })
      )
    )

    if (result) {
      if (hasZed && !hasVscode) {
        spinner.stop("Zed extensions require manual install.")
      } else {
        spinner.stop("Editor extensions installed successfully.")
      }
    }

    if (hasZed) {
      yield* prompter.log.info("Install the Zed `oxc` extension: zed://extension/oxc")
    }
  })

const setupGitHubActions = (
  cwd: string,
  packageManager: SupportedPackageManager,
  scripts: Script[]
) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up GitHub Actions workflow...")

    const workflowExists = yield* github.exists(cwd)
    const workflowPath = github.files[0].path

    if (workflowExists) {
      spinner.message(`\`${workflowPath}\` found, updating...`)
      yield* github.update(cwd, { packageManager, scripts })
      spinner.stop("GitHub Actions workflow updated successfully.")
    } else {
      spinner.message(`Creating \`${workflowPath}\`...`)
      yield* github.create(cwd, { packageManager, scripts })
      spinner.stop("GitHub Actions workflow created successfully.")
    }
  }).pipe(Effect.option)

export default Command.make("init").pipe(
  Command.withDescription("Initialize Adamantite in the current directory"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* printTitle()

      yield* prompter.intro("💠 adamantite init")

      const dependencyInstaller = yield* DependencyInstaller
      const packageManager = yield* dependencyInstaller.detectPackageManager(cwd)

      if (!packageManager) {
        return yield* new NoPackageManager({})
      }

      if (packageManager.warnings?.length) {
        for (const warning of packageManager.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      yield* prompter.log.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo(cwd)

      if (isMonorepo) {
        yield* prompter.log.info("We've detected a monorepo setup in your project.")
      }

      const selectedScripts = yield* prompter.multiselect({
        message: "Which scripts do you want to add to your `package.json`?",
        options: [
          {
            hint: "recommended",
            label: "check - find issues and type errors using oxlint",
            value: "check",
          },
          {
            hint: "recommended",
            label: "fix - fix code issues using oxlint",
            value: "fix",
          },
          {
            hint: "recommended",
            label: "format - code formatting using oxfmt",
            value: "format",
          },
          {
            disabled: !isMonorepo,
            hint: isMonorepo ? undefined : "available for monorepo projects",
            label: "check:monorepo - check for monorepo-specific issues using Sherif",
            value: "check:monorepo",
          },
          {
            disabled: !isMonorepo,
            hint: isMonorepo ? undefined : "available for monorepo projects",
            label: "fix:monorepo - fix monorepo-specific issues using Sherif",
            value: "fix:monorepo",
          },
          {
            label: "analyze - find unused dependencies, exports, and files using knip",
            value: "analyze",
          },
        ],
      })

      const hasOxlint = selectedScripts.includes("check") || selectedScripts.includes("fix")

      let presets: string[] = []
      if (hasOxlint) {
        const selectedPresets = yield* prompter.multiselect({
          message: "Which presets do you want to install? (core is always included)",
          options: [
            { label: "React", value: "react" },
            { label: "Next.js", value: "nextjs" },
            { label: "Vue", value: "vue" },
            { label: "Jest", value: "jest" },
            { label: "Vitest", value: "vitest" },
            { label: "Node", value: "node" },
          ],
          required: false,
        })

        presets = selectedPresets
      }

      let shouldSetupTypescript = false

      if (hasOxlint) {
        shouldSetupTypescript = yield* prompter.confirm({
          initialValue: true,
          message:
            "Adamantite provides a TypeScript preset to enforce strict type-safety. Would you like to use it?",
        })
      }

      const selectedEditors = yield* prompter.multiselect({
        message: "Which editors do you want to configure? (optional)",
        options: [
          { label: "VSCode / Cursor / Windsurf", value: "vscode" },
          { label: "Zed", value: "zed" },
        ],
        required: false,
      })

      let installExtensions = false

      if (selectedEditors.length > 0) {
        const installExtensionsResponse = yield* prompter.confirm({
          initialValue: true,
          message: "Do you want to install the recommended editor extensions?",
        })

        installExtensions = installExtensionsResponse
      }

      const hasCIScripts = hasCICompatibleScripts(selectedScripts)
      let enableGitHubActions = false

      if (hasCIScripts) {
        const enableGitHubActionsResponse = yield* prompter.confirm({
          message: "Do you want to add a GitHub Actions workflow to run checks in CI?",
        })

        enableGitHubActions = enableGitHubActionsResponse
      }

      const hasOxfmt = selectedScripts.includes("format")
      const hasSherif =
        selectedScripts.includes("check:monorepo") || selectedScripts.includes("fix:monorepo")
      const hasKnip = selectedScripts.includes("analyze")

      const dependencies = ["adamantite"]

      if (hasOxlint) {
        dependencies.push(
          `${oxlint.name}@${oxlint.version}`,
          `${tsgolint.name}@${tsgolint.version}`
        )
      }

      if (hasOxfmt) {
        dependencies.push(`${oxfmt.name}@${oxfmt.version}`)
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      if (hasKnip) {
        dependencies.push(`${knip.name}@${knip.version}`)
      }

      yield* installDependencies(cwd, dependencies)

      if (hasOxfmt) {
        yield* setupOxfmtConfig(cwd)
      }

      if (hasOxlint) {
        yield* setupOxlintConfig(cwd, presets)
      }

      if (hasKnip) {
        yield* setupKnipConfig(cwd)
      }

      yield* addScripts(cwd, selectedScripts)

      if (shouldSetupTypescript) {
        yield* setupTypescript(cwd)
      }

      yield* setupEditors(cwd, selectedEditors)

      if (installExtensions) {
        yield* installEditorExtensions(selectedEditors, selectedScripts)
      }

      if (enableGitHubActions) {
        const packageManagerName = packageManager.name

        if (checkIsSupportedPackageManager(packageManagerName)) {
          yield* setupGitHubActions(cwd, packageManagerName, selectedScripts)
        } else {
          yield* prompter.log.warning(
            `Skipping GitHub Actions setup: \`${packageManagerName}\` is not a supported package manager for CI workflow generation.`
          )
        }
      }

      yield* prompter.log.success("Your project is now configured")

      yield* prompter.outro("💠 Adamantite initialized successfully!")
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the initialization process.")
          }),
      })
    )
  )
)
