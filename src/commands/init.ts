import process from "node:process"
import * as Command from "@effect/cli/Command"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { addDevDependency, detectPackageManager, type PackageManagerName } from "nypm"
import type { Script } from "#types.ts"
import {
  FailedToInstallDependency,
  FailedToWriteFile,
  NoPackageManager,
  UnknownScript,
} from "#errors.ts"
import { github, hasCICompatibleScripts } from "#helpers/ci/github.ts"
import { vscode } from "#helpers/editors/vscode.ts"
import { zed } from "#helpers/editors/zed.ts"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import { Cwd } from "#services/cwd.ts"
import { Prompter } from "#services/prompter.ts"
import { checkIsMonorepo, printTitle, readPackageJson } from "#utils.ts"

const installDependencies = (packages: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Installing dependencies...")
    const isMonorepo = yield* checkIsMonorepo()

    yield* Effect.tryPromise({
      catch: (cause) => new FailedToInstallDependency({ cause, packages }),
      try: () => addDevDependency(packages, { silent: true, workspace: isMonorepo }),
    }).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          spinner.stop("Failed to install dependencies.")
        })
      )
    )

    spinner.stop("Dependencies installed.")
  })

const setupOxlintConfig = (presets: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up oxlint config...")

    const exists = yield* oxlint.exists()

    if (exists.hasBoth) {
      yield* prompter.log.warning(
        "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`."
      )
    }

    if (exists.format === "json") {
      spinner.message("Found `.oxlintrc.json`, migrating to `oxlint.config.ts`...")

      yield* oxlint.update(presets)

      spinner.stop("oxlint config migrated successfully.")
    } else if (exists.format === "ts") {
      spinner.message("Found `oxlint.config.ts`, keeping existing config.")

      spinner.stop("oxlint config is ready.")
    } else {
      spinner.message("`oxlint.config.ts` not found, creating...")

      yield* oxlint.create(presets)

      spinner.stop("oxlint config created successfully.")
    }
  })

const setupOxfmtConfig = () =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up oxfmt config...")

    const oxfmtPath = yield* oxfmt.exists()

    if (oxfmtPath.path) {
      spinner.message(`Found \`${oxfmtPath.path}\`, updating...`)

      yield* oxfmt.update()

      spinner.stop("oxfmt config updated successfully.")
    } else {
      spinner.message("`.oxfmtrc.jsonc` or `.oxfmtrc.json` not found, creating...")

      yield* oxfmt.create()

      spinner.stop("oxfmt config created successfully.")
    }
  })

const addScripts = (scripts: Script[]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* Cwd
    const prompter = yield* Prompter
    const packageJson = yield* readPackageJson()
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
        case "typecheck":
          packageJson.scripts.typecheck = "adamantite typecheck"
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
          return yield* Effect.fail(new UnknownScript({ script }))
      }
    }

    const currentDir = yield* cwd.get
    const packagePath = path.join(currentDir, "package.json")
    yield* fs
      .writeFileString(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: packagePath })))

    spinner.stop("Scripts added to your `package.json`")
  })

const setupKnipConfig = () =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up knip config...")

    const knipPath = yield* knip.exists()

    if (knipPath.path) {
      spinner.message(`Found \`${knipPath.path}\`, updating...`)

      yield* knip.update()

      spinner.stop("knip config updated successfully.")
    } else {
      spinner.message("`knip.json` not found, creating...")

      yield* knip.create()

      spinner.stop("knip config created successfully.")
    }
  })

const setupTypescript = () =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up TypeScript config...")

    const typescriptExists = yield* typescript.exists()

    if (typescriptExists) {
      spinner.message("`tsconfig.json` found, updating...")

      yield* typescript.update()

      spinner.stop("`tsconfig.json` updated successfully")
    } else {
      spinner.message("`tsconfig.json` not found, creating...")

      yield* typescript.create()

      spinner.stop("`tsconfig.json` created successfully")
    }
  })

const setupEditors = (editors: string[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    if (editors.includes("vscode")) {
      const spinner = prompter.spinner()

      spinner.start("Checking for `.vscode/settings.json`...")

      const hasVscodeSettings = yield* vscode.exists()
      if (hasVscodeSettings) {
        spinner.message("`.vscode/settings.json` found, updating...")
        yield* vscode.update()
        spinner.stop("`.vscode/settings.json` updated with Adamantite preset.")
      } else {
        spinner.message("`.vscode/settings.json` not found, creating...")
        yield* vscode.create()
        spinner.stop("`.vscode/settings.json` created with Adamantite preset.")
      }
    }

    if (editors.includes("zed")) {
      const spinner = prompter.spinner()

      spinner.start("Checking for `.zed/settings.json`...")

      const hasZedSettings = yield* zed.exists()
      if (hasZedSettings) {
        spinner.message("`.zed/settings.json` found, updating...")
        yield* zed.update()
        spinner.stop("`.zed/settings.json` updated with Adamantite preset.")
      } else {
        spinner.message("`.zed/settings.json` not found, creating...")
        yield* zed.create()
        spinner.stop("`.zed/settings.json` created with Adamantite preset.")
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
      Effect.catchTags({
        FailedToInstallExtension: (error) =>
          Effect.gen(function* () {
            yield* prompter.log.warning(
              `⚠️ Failed to install the \`${error.extension}\` extension.`
            )
            yield* prompter.log.warning("Please install it manually after setup completes.")
            return false as const
          }),
        VscodeCliNotFound: () =>
          Effect.gen(function* () {
            yield* prompter.log.error("VSCode CLI ('code' command) not found.")
            yield* prompter.log.info("To install it:")
            yield* prompter.log.info("  1. Open VS Code")
            yield* prompter.log.info(
              "  2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)"
            )
            yield* prompter.log.info("  3. Run 'Shell Command: Install \"code\" command in PATH'")
            return false as const
          }),
      })
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

const setupGitHubActions = (packageManager: PackageManagerName, scripts: Script[]) =>
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const spinner = prompter.spinner()
    spinner.start("Setting up GitHub Actions workflow...")

    const workflowExists = yield* github.exists()

    if (workflowExists) {
      spinner.message("`.github/workflows/adamantite.yml` found, updating...")
      yield* github.update({ packageManager, scripts })
      spinner.stop("GitHub Actions workflow updated successfully.")
    } else {
      spinner.message("Creating `.github/workflows/adamantite.yml`...")
      yield* github.create({ packageManager, scripts })
      spinner.stop("GitHub Actions workflow created successfully.")
    }
  }).pipe(Effect.option)

export default Command.make("init").pipe(
  Command.withDescription("Initialize Adamantite in the current directory"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()

      yield* prompter.intro("💠 adamantite init")

      const packageManager = yield* Effect.tryPromise({
        catch: (cause) => new NoPackageManager({ cause }),
        try: () => detectPackageManager(process.cwd()),
      })

      if (!packageManager) {
        return yield* Effect.fail(new NoPackageManager({}))
      }

      if (packageManager.warnings?.length) {
        for (const warning of packageManager.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      yield* prompter.log.info(`Detected package manager: ${packageManager.name}`)

      const isMonorepo = yield* checkIsMonorepo()

      if (isMonorepo) {
        yield* prompter.log.info("We've detected a monorepo setup in your project.")
      }

      const selectedScripts = yield* prompter.multiselect({
        message: "Which scripts do you want to add to your `package.json`?",
        options: [
          {
            hint: "recommended",
            label: "check - find issues in code using oxlint",
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
            hint: "extends the `adamantite/typescript` preset in your `tsconfig.json`",
            label: "typecheck - type-check your code using tsc",
            value: "typecheck",
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
      const hasTypecheck = selectedScripts.includes("typecheck")
      const hasKnip = selectedScripts.includes("analyze")

      const dependencies = ["adamantite"]

      if (hasOxlint) {
        dependencies.push(`${oxlint.name}@${oxlint.version}`)
        dependencies.push(`${tsgolint.name}@${tsgolint.version}`)
      }

      if (hasOxfmt) {
        dependencies.push(`${oxfmt.name}@${oxfmt.version}`)
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      if (hasTypecheck) {
        dependencies.push(`${typescript.name}@${typescript.version}`)
      }

      if (hasKnip) {
        dependencies.push(`${knip.name}@${knip.version}`)
      }

      yield* installDependencies(dependencies)

      if (hasOxfmt) {
        yield* setupOxfmtConfig()
      }

      if (hasOxlint) {
        yield* setupOxlintConfig(presets)
      }

      if (hasKnip) {
        yield* setupKnipConfig()
      }

      yield* addScripts(selectedScripts)

      if (hasTypecheck) {
        yield* setupTypescript()
      }

      yield* setupEditors(selectedEditors)

      if (installExtensions) {
        yield* installEditorExtensions(selectedEditors, selectedScripts)
      }

      if (enableGitHubActions) {
        yield* setupGitHubActions(packageManager.name, selectedScripts)
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
