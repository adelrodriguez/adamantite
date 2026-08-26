import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const PNPM_PACKAGES_KEY_REGEX = /^(?:packages|"packages"|'packages')\s*:/u

function stripYamlComment(value: string): string {
  return value.replace(/(?:^|\s+)#.*$/u, "").trim()
}

function definesPnpmWorkspacePackages(content: string): boolean {
  const lines = content.replace(/^\uFEFF/u, "").split(/\r?\n/u)
  const packagesIndex = lines.findIndex((line) => PNPM_PACKAGES_KEY_REGEX.test(line))

  if (packagesIndex === -1) {
    return false
  }

  const declaration = stripYamlComment(
    (lines[packagesIndex] ?? "").replace(PNPM_PACKAGES_KEY_REGEX, "")
  )

  if (declaration === "[") {
    for (const line of lines.slice(packagesIndex + 1)) {
      const item = stripYamlComment(line)

      if (item.length === 0) {
        continue
      }

      return item !== "]"
    }

    return false
  }

  if (declaration && !declaration.startsWith("#")) {
    return !/^\[\s*\]$/u.test(declaration)
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
    const workspaces = packageJson.workspaces
    const patterns = Array.isArray(workspaces) ? workspaces : workspaces?.packages

    return (patterns?.length ?? 0) > 0
  })
