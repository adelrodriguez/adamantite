import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import * as p from "@clack/prompts"
import { Fault } from "faultier"
import { err, fromPromise, fromSafePromise, ok, safeTry } from "neverthrow"
import { type PackageManagerName, addDevDependency } from "nypm"
import type { Script } from "#types.ts"
import { github, hasCICompatibleScripts } from "#helpers/ci/github.ts"
import { vscode } from "#helpers/editors/vscode.ts"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import {
  checkIsMonorepo,
  defineCommand,
  getPackageManagerName,
  printTitle,
  readPackageJson,
} from "#utils.ts"

const installDependencies = (packages: string[]) =>
  safeTry(async function* () {
    const s = p.spinner()
    s.start("Installing dependencies...")
    const isMonorepo = yield* checkIsMonorepo()

    yield* fromPromise(
      addDevDependency(packages, { silent: true, workspace: isMonorepo }),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_INSTALL_DEPENDENCY")
          .withMessage(`Failed to install dependencies: ${packages.join(", ")}`)
    )

    s.stop("Dependencies installed.")

    return ok()
  })

const setupOxlintConfig = (presets: string[]) =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up oxlint config...")

    const oxlintPath = await oxlint.exists()

    if (oxlintPath.path) {
      spinner.message(`Found \`${oxlintPath.path}\`, updating...`)

      yield* oxlint.update(presets)

      spinner.stop("oxlint config updated successfully.")
    } else {
      spinner.message("`.oxlintrc.json` not found, creating...")

      yield* oxlint.create(presets)

      spinner.stop("oxlint config created successfully.")
    }

    return ok()
  })

const setupOxfmtConfig = () =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up oxfmt config...")

    const oxfmtPath = await oxfmt.exists()

    if (oxfmtPath.path) {
      spinner.message(`Found \`${oxfmtPath.path}\`, updating...`)

      yield* oxfmt.update()

      spinner.stop("oxfmt config updated successfully.")
    } else {
      spinner.message("`.oxfmtrc.jsonc` or `.oxfmtrc.json` not found, creating...")

      yield* oxfmt.create()

      spinner.stop("oxfmt config created successfully.")
    }

    return ok()
  })

const addScripts = (scripts: Script[]) =>
  safeTry(async function* () {
    const cwd = process.cwd()
    const packageJson = yield* readPackageJson()
    const spinner = p.spinner()
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
          return err(Fault.create("UNKNOWN_SCRIPT").withContext({ script }))
      }
    }

    yield* fromPromise(
      writeFile(join(cwd, "package.json"), JSON.stringify(packageJson, null, 2)),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write package.json",
            "We're unable to update the package.json file."
          )
          .withContext({ path: join(cwd, "package.json") })
    )

    spinner.stop("Scripts added to your `package.json`")

    return ok()
  })

const setupKnipConfig = () =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up knip config...")

    const knipPath = await knip.exists()

    if (knipPath.path) {
      spinner.message(`Found \`${knipPath.path}\`, updating...`)

      yield* knip.update()

      spinner.stop("knip config updated successfully.")
    } else {
      spinner.message("`knip.json` not found, creating...")

      yield* knip.create()

      spinner.stop("knip config created successfully.")
    }

    return ok()
  })

const setupTypescript = () =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up TypeScript config...")

    if (await typescript.exists()) {
      spinner.message("`tsconfig.json` found, updating...")

      yield* typescript.update()

      spinner.stop("`tsconfig.json` updated successfully")
    } else {
      spinner.message("`tsconfig.json` not found, creating...")

      yield* typescript.create()

      spinner.stop("`tsconfig.json` created successfully")
    }

    return ok()
  })

const setupEditors = (editors: string[]) =>
  safeTry(async function* () {
    if (editors.includes("vscode")) {
      const spinner = p.spinner()

      spinner.start("Checking for `.vscode/settings.json`...")

      if (await vscode.exists()) {
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
      // TODO: Implement Zed configuration
    }

    return ok()
  })

const installEditorExtensions = (editors: string[], scripts: Script[]) =>
  safeTry(function* () {
    const spinner = p.spinner()
    spinner.start("Installing editor extensions...")

    if (editors.includes("vscode")) {
      spinner.message("Installing VS Code extension...")
      yield* vscode.extension(scripts)
    }

    if (editors.includes("zed")) {
      // TODO: Implement Zed extension installation
    }

    spinner.stop("Editor extensions installed successfully.")
    return ok()
  })

const setupGitHubActions = (packageManager: PackageManagerName, scripts: Script[]) =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up GitHub Actions workflow...")

    if (await github.exists()) {
      spinner.message("`.github/workflows/adamantite.yml` found, updating...")
      yield* github.update({ packageManager, scripts })
      spinner.stop("GitHub Actions workflow updated successfully.")
    } else {
      spinner.message("Creating `.github/workflows/adamantite.yml`...")
      yield* github.create({ packageManager, scripts })
      spinner.stop("GitHub Actions workflow created successfully.")
    }

    return ok()
  })

export default defineCommand({
  command: "init",
  describe: "Initialize Adamantite in the current directory",
  builder: (yargs) => yargs,
  handler: () =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      printTitle()

      p.intro("💠 adamantite init")

      p.log.info(`Detected package manager: ${packageManager}`)

      const isMonorepo = yield* checkIsMonorepo()

      if (isMonorepo) {
        p.log.info("We've detected a monorepo setup in your project.")
      }

      const scripts = yield* fromSafePromise(
        p.multiselect({
          message: "Which scripts do you want to add to your `package.json`?",
          options: [
            {
              label: "check - find issues in code using oxlint",
              value: "check",
              hint: "recommended",
            },
            {
              label: "fix - fix code issues using oxlint",
              value: "fix",
              hint: "recommended",
            },
            {
              label: "format - code formatting using oxfmt",
              value: "format",
              hint: "recommended",
            },
            {
              label: "typecheck - type-check your code using tsgo",
              value: "typecheck",
              hint: "extends the `adamantite/typescript` preset in your `tsconfig.json`",
            },
            {
              label: "check:monorepo - check for monorepo-specific issues using Sherif",
              value: "check:monorepo",
              hint: isMonorepo ? undefined : "available for monorepo projects",
              disabled: !isMonorepo,
            },
            {
              label: "fix:monorepo - fix monorepo-specific issues using Sherif",
              value: "fix:monorepo",
              hint: isMonorepo ? undefined : "available for monorepo projects",
              disabled: !isMonorepo,
            },
            {
              label: "analyze - find unused dependencies, exports, and files using knip",
              value: "analyze",
            },
          ],
        })
      )

      if (p.isCancel(scripts)) {
        return err(Fault.create("OPERATION_CANCELLED"))
      }

      const hasOxlint = scripts.includes("check") || scripts.includes("fix")

      let presets: string[] | symbol = []
      if (hasOxlint) {
        presets = yield* fromSafePromise(
          p.multiselect({
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
        )

        if (p.isCancel(presets)) {
          return err(Fault.create("OPERATION_CANCELLED"))
        }
      }

      const editors = yield* fromSafePromise(
        p.multiselect({
          message: "Which editors do you want to configure? (optional)",
          options: [
            { label: "VSCode / Cursor / Windsurf", value: "vscode" },
            { label: "Zed", value: "zed", disabled: true, hint: "coming soon" },
          ],
          required: false,
        })
      )

      if (p.isCancel(editors)) {
        return err(Fault.create("OPERATION_CANCELLED"))
      }

      let installExtensions = false
      if (editors.length > 0) {
        const installExtensionsResponse = yield* fromSafePromise(
          p.confirm({
            message: "Do you want to install the recommended editor extensions?",
            initialValue: true,
          })
        )

        if (p.isCancel(installExtensionsResponse)) {
          return err(Fault.create("OPERATION_CANCELLED"))
        }

        installExtensions = installExtensionsResponse
      }

      const hasCIScripts = hasCICompatibleScripts(scripts)

      let enableGitHubActions: boolean | symbol = false
      if (hasCIScripts) {
        enableGitHubActions = yield* fromSafePromise(
          p.confirm({
            message: "Do you want to add a GitHub Actions workflow to run checks in CI?",
          })
        )

        if (p.isCancel(enableGitHubActions)) {
          return err(Fault.create("OPERATION_CANCELLED"))
        }
      }

      const hasOxfmt = scripts.includes("format")
      const hasSherif = scripts.includes("check:monorepo") || scripts.includes("fix:monorepo")
      const hasTypecheck = scripts.includes("typecheck")
      const hasKnip = scripts.includes("analyze")

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

      yield* addScripts(scripts)

      if (hasTypecheck) {
        yield* setupTypescript()
      }

      yield* setupEditors(editors)

      if (installExtensions) {
        yield* installEditorExtensions(editors, scripts)
      }

      if (enableGitHubActions) {
        yield* setupGitHubActions(packageManager, scripts)
      }

      return ok()
    }).match(
      () => {
        p.outro("💠 Adamantite initialized successfully!")
        process.exit(0)
      },
      (error) => {
        if (Fault.isFault(error) && error.tag === "OPERATION_CANCELLED") {
          p.cancel("You've cancelled the initialization process.")
          process.exit(0)
        }

        if (!Fault.isFault(error)) {
          // We should never reach this point
          p.log.error(`An unexpected error occurred: ${String(error)}`)
          p.cancel("Failed to initialize Adamantite")
          process.exit(1)
        }

        p.log.error(error.flatten())

        p.cancel("Failed to initialize Adamantite")
        process.exit(1)
      }
    ),
})
