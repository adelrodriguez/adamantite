import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { readDirectoryIfExists, readFileIfExists } from "#lib/shared/filesystem.ts"
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

function unquote(value: string) {
  return value.replace(/^(["'])(.*)\1$/u, "$2")
}

/**
 * The package patterns in a `pnpm-workspace.yaml`, in block (`- packages/*`) or flow
 * (`[packages/*]`) style.
 */
export function readPnpmWorkspacePatterns(content: string): string[] {
  const lines = content.replace(/^\uFEFF/u, "").split(/\r?\n/u)
  const packagesIndex = lines.findIndex((line) => PNPM_PACKAGES_KEY_REGEX.test(line))

  if (packagesIndex === -1) {
    return []
  }

  const declaration = stripYamlComment(
    (lines[packagesIndex] ?? "").replace(PNPM_PACKAGES_KEY_REGEX, "")
  )

  if (declaration.startsWith("[")) {
    const flow = [
      declaration,
      ...lines.slice(packagesIndex + 1).map((line) => stripYamlComment(line)),
    ].join(" ")
    const end = flow.indexOf("]")

    return flow
      .slice(1, end === -1 ? undefined : end)
      .split(",")
      .map((item) => unquote(item.trim()))
      .filter((item) => item.length > 0)
  }

  const patterns: string[] = []

  for (const line of lines.slice(packagesIndex + 1)) {
    const item = /^\s*-\s*(.+)$/u.exec(stripYamlComment(line))?.[1]

    if (item !== undefined) {
      patterns.push(unquote(item.trim()))
    } else if (/^\S/u.test(line) && !line.startsWith("#")) {
      break
    }
  }

  return patterns
}

/**
 * The absolute directories of the workspace packages, without the root. A pattern is a literal
 * directory or a directory followed by `/*` or `/**`. Both wildcard forms match the direct
 * subdirectories only. Negated patterns are ignored.
 */
export const getWorkspacePackageDirectories = (cwd: string = process.cwd()) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const pnpmWorkspace = yield* readFileIfExists(path.join(cwd, "pnpm-workspace.yaml"))
    const packageJson = yield* readPackageJson(cwd)
    const workspaces = packageJson.workspaces
    const patterns = Option.match(pnpmWorkspace, {
      onNone: () => (Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? [])),
      onSome: (content) => readPnpmWorkspacePatterns(content),
    })
    const directories = yield* Effect.forEach(
      patterns.filter((pattern) => !pattern.startsWith("!")),
      (pattern) =>
        Effect.gen(function* () {
          const wildcard = /^(.*?)\/\*\*?$/u.exec(pattern)

          if (wildcard === null) {
            const directory = path.resolve(cwd, pattern)
            const entries = yield* readDirectoryIfExists(directory)

            return Option.isSome(entries) ? [directory] : []
          }

          const parent = path.resolve(cwd, wildcard[1] ?? ".")
          const entries = yield* readDirectoryIfExists(parent)
          const children = Option.getOrElse(entries, (): string[] => [])
          const packages = yield* Effect.forEach(
            children,
            (child) =>
              readDirectoryIfExists(path.join(parent, child)).pipe(
                Effect.map((nested) => (Option.isSome(nested) ? [path.join(parent, child)] : []))
              ),
            { concurrency: "unbounded" }
          )

          return packages.flat()
        }),
      { concurrency: "unbounded" }
    )

    return Array.dedupe(directories.flat())
  })
