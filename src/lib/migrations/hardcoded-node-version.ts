import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import github from "#lib/integrations/ci/github.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { FailedToReadFile, MigrationValidationFailed } from "#lib/shared/errors.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import {
  checkIsSupportedPackageManager,
  getManagedScripts,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const HARDCODED_NODE_VERSION_REGEX = /^\s*node-version:\s*"?\d/m

function getGitHubWorkflowPath() {
  return github.files[0].path
}

const readWorkflow = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const workflowPath = path.join(cwd, getGitHubWorkflowPath())
    const exists = yield* fs.exists(workflowPath)

    if (!exists) {
      return null
    }

    return yield* fs
      .readFileString(workflowPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: workflowPath })))
  })

const canRegenerateWorkflow = (cwd: string) =>
  Effect.gen(function* () {
    const dependencyInstaller = yield* DependencyInstaller
    const packageJson = yield* readPackageJson(cwd)
    const managedScripts = getManagedScripts(packageJson)

    if (!hasCICompatibleScripts(managedScripts)) {
      return { reason: "scripts", supported: false } as const
    }

    const detectedPackageManager = yield* dependencyInstaller.detectPackageManager(cwd)

    if (!detectedPackageManager) {
      return { reason: "no-package-manager", supported: false } as const
    }

    if (!checkIsSupportedPackageManager(detectedPackageManager.name)) {
      return {
        packageManagerName: detectedPackageManager.name,
        reason: "unsupported-package-manager",
        supported: false,
      } as const
    }

    return {
      packageManager: detectedPackageManager.name,
      scripts: managedScripts,
      supported: true,
    } as const
  })

export default defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const workflow = yield* readWorkflow(context.cwd)

      if (workflow === null || !HARDCODED_NODE_VERSION_REGEX.test(workflow)) {
        return { status: "not-applicable", warnings: [] } as const
      }

      const regeneration = yield* canRegenerateWorkflow(context.cwd)

      if (!regeneration.supported) {
        const warning =
          regeneration.reason === "scripts"
            ? "No CI-compatible managed scripts were found, so the GitHub Actions workflow was not updated."
            : regeneration.reason === "no-package-manager"
              ? "Could not detect a package manager, so the GitHub Actions workflow was not updated."
              : `\`${regeneration.packageManagerName}\` is not a supported package manager for CI workflow generation, so the GitHub Actions workflow was not updated.`

        return { status: "not-applicable", warnings: [warning] } as const
      }

      return {
        status: "needed",
        summary:
          "Replacing the hard-coded Node.js version in the GitHub Actions workflow with the project's Node.js version declaration.",
        warnings: [],
      } as const
    }),
  files: [getGitHubWorkflowPath()],
  id: "hardcoded-node-version",
  migrate: (context) =>
    Effect.gen(function* () {
      const regeneration = yield* canRegenerateWorkflow(context.cwd)

      if (!regeneration.supported) {
        return yield* Effect.die(new Error("check() guaranteed workflow regeneration is supported"))
      }

      yield* github.update(context.cwd, {
        packageManager: regeneration.packageManager,
        scripts: regeneration.scripts,
      })

      return { warnings: [] }
    }),
  tags: ["update"],
  title: "Hard-coded workflow Node.js version",
  validate: (context) =>
    Effect.gen(function* () {
      const workflow = yield* readWorkflow(context.cwd)

      if (workflow !== null && HARDCODED_NODE_VERSION_REGEX.test(workflow)) {
        return yield* new MigrationValidationFailed({
          migrationId: "hardcoded-node-version",
          reason: "The GitHub Actions workflow still contains a hard-coded Node.js version.",
        })
      }
    }),
})
