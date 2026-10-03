import type * as FileSystem from "effect/FileSystem"
import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { FailedToReadFile } from "#lib/shared/errors.ts"
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

function escapeRegExp(text: string) {
  return text.replaceAll(/[$()+.[\\\]^{|}]/gu, String.raw`\$&`)
}

/**
 * Convert a workspace pattern to a regular expression that matches a relative directory path. `*`
 * and `?` match inside one path segment, and a `**` segment matches zero or more segments.
 */
export function workspacePatternToRegExp(pattern: string): RegExp {
  const segments = pattern.replace(/^\.\//u, "").replace(/\/+$/u, "").split("/")
  let source = ""

  for (const [index, segment] of segments.entries()) {
    // A segment after `**` takes its separator from the `**` part.
    const separator = index === 0 || segments[index - 1] === "**" ? "" : "/"

    if (segment !== "**") {
      source += `${separator}${escapeRegExp(segment).replaceAll("*", "[^/]*").replaceAll("?", "[^/]")}`
    } else if (index < segments.length - 1) {
      source += `${separator}(?:[^/]+/)*`
    } else {
      source += index === 0 ? "(?:[^/]+(?:/[^/]+)*)?" : "(?:/[^/]+)*"
    }
  }

  return new RegExp(`^${source}$`, "u")
}

/**
 * The fixed directory before the first wildcard segment of a pattern, such as `packages` for
 * `packages/*`, and the number of segments after it. The depth is unbounded with `**`.
 */
function getPatternBase(pattern: string) {
  const segments = pattern.replace(/^\.\//u, "").replace(/\/+$/u, "").split("/")
  const wildcardIndex = segments.findIndex((segment) => /[*?]/u.test(segment))

  if (wildcardIndex === -1) {
    return { base: segments.join("/"), depth: 0 }
  }

  return {
    base: segments.slice(0, wildcardIndex).join("/"),
    depth: segments.includes("**") ? Number.POSITIVE_INFINITY : segments.length - wildcardIndex,
  }
}

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules"])

/**
 * The directory and every subdirectory up to `depth` levels below it, relative to `cwd`. Skips
 * `node_modules` and directories whose names start with a dot.
 */
const listDirectories = (
  cwd: string,
  relative: string,
  depth: number
): Effect.Effect<string[], FailedToReadFile, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const entries = yield* readDirectoryIfExists(path.resolve(cwd, relative))

    if (Option.isNone(entries)) {
      return []
    }

    if (depth === 0) {
      return [relative]
    }

    const children = yield* Effect.forEach(
      entries.value.filter((entry) => !entry.startsWith(".") && !SKIPPED_DIRECTORIES.has(entry)),
      (entry) => listDirectories(cwd, relative === "" ? entry : `${relative}/${entry}`, depth - 1),
      { concurrency: "unbounded" }
    )

    return [relative, ...children.flat()]
  })

/**
 * The absolute directories of the workspace packages, without the root. A package is a directory
 * with a `package.json` that matches an include pattern and no `!` exclusion pattern.
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
    const includes = patterns.filter((pattern) => !pattern.startsWith("!"))
    const excludes = patterns
      .filter((pattern) => pattern.startsWith("!"))
      .map((pattern) => workspacePatternToRegExp(pattern.slice(1)))
    const candidates = yield* Effect.forEach(
      includes,
      (pattern) =>
        Effect.gen(function* () {
          const { base, depth } = getPatternBase(pattern)
          const matcher = workspacePatternToRegExp(pattern)
          const directories = yield* listDirectories(cwd, base, depth)

          return directories.filter((directory) => directory !== "" && matcher.test(directory))
        }),
      { concurrency: "unbounded" }
    )
    const matched = Array.dedupe(candidates.flat()).filter(
      (directory) => !excludes.some((exclude) => exclude.test(directory))
    )
    const packages = yield* Effect.forEach(
      matched,
      (directory) =>
        readFileIfExists(path.join(cwd, directory, "package.json")).pipe(
          Effect.map((manifest) => (Option.isSome(manifest) ? [path.resolve(cwd, directory)] : []))
        ),
      { concurrency: "unbounded" }
    )

    return packages.flat()
  })
