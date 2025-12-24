import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import * as p from "@clack/prompts"
import { Fault } from "faultier"
import { err, fromPromise, fromSafePromise, ok, safeTry } from "neverthrow"
import { addDevDependency } from "nypm"
import { vscode } from "#helpers/editors/vscode.ts"
import { biome } from "#helpers/packages/biome.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { tsconfig } from "#helpers/tsconfig.ts"
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

    for (const pkg of packages) {
      yield* fromPromise(addDevDependency(pkg, { silent: true, workspace: isMonorepo }), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_INSTALL_DEPENDENCY")
          .withMessage(`Failed to install ${pkg}`)
      )
    }

    s.stop("Dependencies installed.")

    return ok()
  })

const setupBiomeConfig = () =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up Biome config...")

    const biomePath = await biome.exists()

    if (biomePath.path) {
      spinner.message(`Found \`${biomePath.path}\`, updating...`)

      yield* biome.update()

      spinner.stop("Biome config updated successfully.")
    } else {
      spinner.message("`.biome.jsonc` or `.biome.json` not found, creating...")

      yield* biome.create()

      spinner.stop("Biome config created successfully.")
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

const addScripts = (scripts: string[]) =>
  safeTry(async function* () {
    const cwd = process.cwd()
    const packageJson = yield* readPackageJson()
    const spinner = p.spinner()
    spinner.start("Adding scripts to your `package.json`...")

    if (!packageJson.scripts) {
      packageJson.scripts = {}
    }

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
          packageJson.scripts.typecheck = "tsc --noEmit"
          break
        case "check:monorepo":
          packageJson.scripts["check:monorepo"] = "adamantite monorepo"
          break
        case "fix:monorepo":
          packageJson.scripts["fix:monorepo"] = "adamantite monorepo --fix"
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

const setupTypescript = () =>
  safeTry(async function* () {
    const spinner = p.spinner()
    spinner.start("Setting up TypeScript config...")

    if (await tsconfig.exists()) {
      spinner.message("`tsconfig.json` found, updating...")

      yield* tsconfig.update()

      spinner.stop("`tsconfig.json` updated successfully")
    } else {
      spinner.message("`tsconfig.json` not found, creating...")

      yield* tsconfig.create()

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
              label: "check - find issues in code using Biome",
              value: "check",
              hint: "recommended",
            },
            {
              label: "fix - fix code issues using Biome",
              value: "fix",
              hint: "recommended",
            },
            {
              label: "format - code formatting using oxfmt",
              value: "format",
              hint: "recommended",
            },
            {
              label: "typecheck - type-check your code using strict TypeScript preset",
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
          ],
        })
      )

      if (p.isCancel(scripts)) {
        return err(Fault.create("OPERATION_CANCELLED"))
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

      const hasBiome = scripts.includes("check") || scripts.includes("fix")
      const hasOxfmt = scripts.includes("format")
      const hasSherif = scripts.includes("check:monorepo") || scripts.includes("fix:monorepo")
      const hasTypecheck = scripts.includes("typecheck")

      const dependencies = ["adamantite"]

      if (hasBiome) {
        dependencies.push(`${biome.name}@${biome.version}`)
      }

      if (hasOxfmt) {
        dependencies.push(`${oxfmt.name}@${oxfmt.version}`)
      }

      if (hasSherif) {
        dependencies.push(`${sherif.name}@${sherif.version}`)
      }

      yield* installDependencies(dependencies)

      if (hasOxfmt) {
        yield* setupOxfmtConfig()
      }

      if (hasBiome) {
        yield* setupBiomeConfig()
      }

      yield* addScripts(scripts)

      if (hasTypecheck) {
        yield* setupTypescript()
      }

      yield* setupEditors(editors)

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
