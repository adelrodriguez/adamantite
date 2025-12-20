import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { cancel, confirm, intro, isCancel, log, multiselect, outro, spinner } from "@clack/prompts"
import { Fault } from "faultier"
import { err, fromPromise, fromSafePromise, ok, safeTry } from "neverthrow"
import { addDevDependency } from "nypm"
import { vscode } from "#helpers/editors/vscode.ts"
import { biome } from "#helpers/packages/biome.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { tsconfig } from "#helpers/tsconfig.ts"
import { checkIfExists, defineCommand, getTitle, readPackageJson } from "#utils.ts"

export default defineCommand({
  command: "init",
  describe: "Initialize Adamantite in the current directory",
  builder: (yargs) => yargs,
  handler: async () => {
    intro(getTitle())
    const cwd = process.cwd()

    const result = await safeTry(async function* () {
      let packageJson = yield* readPackageJson()
      const hasPnpmWorkspace = await checkIfExists(join(process.cwd(), "pnpm-workspace.yaml"))

      const isMonorepo = packageJson.workspaces !== undefined || hasPnpmWorkspace

      const shouldInstallScripts = yield* fromSafePromise(
        confirm({
          message: "Do you want to add the `check` and `fix` scripts to your `package.json`?",
        })
      ).andThen((r) => (isCancel(r) ? err(Fault.create("OPERATION_CANCELLED")) : ok(r)))

      const shouldInstallMonorepoScripts = isMonorepo
        ? yield* fromSafePromise(
            confirm({
              message:
                "We've detected a monorepo setup in your project. Would you like to install monorepo linting scripts?",
            })
          ).andThen((r) => (isCancel(r) ? err(Fault.create("OPERATION_CANCELLED")) : ok(r)))
        : false

      const shouldInstallTypeScriptPreset = yield* fromSafePromise(
        confirm({
          message:
            "Adamantite provides a TypeScript preset to enforce strict type-safety. Would you like to install it?",
        })
      ).andThen((r) => (isCancel(r) ? err(Fault.create("OPERATION_CANCELLED")) : ok(r)))

      const selectedEditors = yield* fromSafePromise(
        multiselect({
          message: "Which editors do you want to configure (recommended)?",
          options: [
            { label: "VSCode / Cursor / Windsurf", value: "vscode" },
            { label: "Zed (coming soon)", value: "zed" },
          ],
          required: false,
        })
      ).andThen((r) => (isCancel(r) ? err(Fault.create("OPERATION_CANCELLED")) : ok(r)))

      // =============================== ADD DEPENDENCIES ===============================
      const installingDependencies = spinner()

      installingDependencies.start("Installing dependencies...")

      // Install Adamantite first
      yield* fromPromise(addDevDependency("adamantite"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_INSTALL_DEPENDENCY")
          .withMessage("Failed to install Adamantite")
      )

      yield* fromPromise(addDevDependency(`${biome.name}@${biome.version}`), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_INSTALL_DEPENDENCY")
          .withMessage("Failed to install Biome")
      )

      if (shouldInstallMonorepoScripts) {
        yield* fromPromise(addDevDependency(`${sherif.name}@${sherif.version}`), (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_INSTALL_DEPENDENCY")
            .withMessage("Failed to install Sherif")
        )
      }

      installingDependencies.stop("Dependencies installed successfully")

      // =============================== SETUP BIOME CONFIG ===============================
      const settingUpBiomeConfig = spinner()

      settingUpBiomeConfig.start("Setting up Biome config...")

      const biomePath = await biome.exists()

      if (biomePath.path) {
        settingUpBiomeConfig.message("Biome config found, updating...")

        yield* biome.update()

        settingUpBiomeConfig.stop("Biome config updated successfully")
      } else {
        settingUpBiomeConfig.message("Biome config not found, creating...")

        yield* biome.create()

        settingUpBiomeConfig.stop("Biome config created successfully")
      }

      // =============================== ADD SCRIPTS ===============================
      if (shouldInstallScripts) {
        const addingScripts = spinner()
        packageJson = yield* readPackageJson()
        addingScripts.start("Adding scripts to your `package.json`...")

        if (!packageJson.scripts) {
          packageJson.scripts = {}
        }

        packageJson.scripts.check = "adamantite check"
        packageJson.scripts.fix = "adamantite fix"

        if (shouldInstallMonorepoScripts) {
          packageJson.scripts["lint:monorepo"] = "adamantite monorepo"
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

        addingScripts.stop("Scripts added to your `package.json`")
      }

      // =============================== SETUP TYPESCRIPT CONFIG ===============================

      if (shouldInstallTypeScriptPreset) {
        const settingUpTypeScriptConfig = spinner()
        settingUpTypeScriptConfig.start("Setting up TypeScript config...")

        if (await tsconfig.exists()) {
          settingUpTypeScriptConfig.message("`tsconfig.json` found, updating...")

          yield* tsconfig.update()

          settingUpTypeScriptConfig.stop("`tsconfig.json` updated successfully")
        } else {
          settingUpTypeScriptConfig.message("`tsconfig.json` not found, creating...")

          yield* tsconfig.create()

          settingUpTypeScriptConfig.stop("`tsconfig.json` created successfully")
        }
      }

      // =============================== SETUP EDITOR CONFIG ===============================

      if (selectedEditors.length > 0) {
        const settingUpEditorConfig = spinner()
        settingUpEditorConfig.start("Setting up editor config...")

        if (selectedEditors.includes("vscode")) {
          const settingUpVSCodeConfig = spinner()
          settingUpVSCodeConfig.start("Setting up VSCode config...")

          if (await vscode.exists()) {
            settingUpVSCodeConfig.message("VSCode settings found, updating...")
            yield* vscode.update()
            settingUpVSCodeConfig.stop("VSCode settings updated with Adamantite preset")
          } else {
            settingUpVSCodeConfig.message("VSCode settings not found, creating...")
            yield* vscode.create()
            settingUpVSCodeConfig.stop("VSCode settings created with Adamantite preset")
          }
        }

        if (selectedEditors.includes("zed")) {
          log.warning("Zed configuration coming soon...")
        }

        settingUpEditorConfig.stop("Editor config set up successfully")
      }

      return ok()
    })

    if (result.isOk()) {
      outro("💠 Adamantite initialized successfully!")
      return
    }

    if (result.error.tag === "OPERATION_CANCELLED") {
      cancel("You've cancelled the initialization process.")
      return
    }

    log.error(result.error.message)
    cancel("Failed to initialize Adamantite")
    process.exit(1)
  },
})
