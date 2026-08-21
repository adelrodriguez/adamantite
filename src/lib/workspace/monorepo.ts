import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

function definesPnpmWorkspacePackages(content: string): boolean {
  const lines = content.split(/\r?\n/u)
  const packagesIndex = lines.findIndex((line) => /^packages\s*:/u.test(line))

  if (packagesIndex === -1) {
    return false
  }

  const declaration = lines[packagesIndex]?.replace(/^packages\s*:/u, "").trim()

  if (declaration && !declaration.startsWith("#")) {
    return declaration !== "[]"
  }

  for (const line of lines.slice(packagesIndex + 1)) {
    if (/^\s*-\s*[^#\s]/u.test(line)) {
      return true
    }

    if (/^\S/u.test(line) && !line.startsWith("#")) {
      return false
    }
  }

  return false
}

export const checkIsMonorepo = (cwd: string = process.cwd()) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const pnpmWorkspace = yield* readFileIfExists(path.join(cwd, "pnpm-workspace.yaml"))

    if (Option.isSome(pnpmWorkspace) && definesPnpmWorkspacePackages(pnpmWorkspace.value)) {
      return true
    }

    const packageJson = yield* readPackageJson(cwd)
    return Array.isArray(packageJson.workspaces) && packageJson.workspaces.length > 0
  })
