import type * as FileSystem from "effect/FileSystem"
import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { FailedToParseYaml, type FailedToReadFile } from "#lib/shared/errors.ts"
import { readDirectoryIfExists, readFileIfExists } from "#lib/shared/filesystem.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const PnpmWorkspace = Schema.Struct({ packages: Schema.Array(Schema.String) })

const PnpmCatalogs = Schema.Struct({
  catalog: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  catalogs: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String))
  ),
})

/**
 * The pnpm catalogs of the project by name, each a map from a package name to its specifier. The
 * `catalog` field of `pnpm-workspace.yaml` is the catalog named `default`.
 */
export type Catalogs = Readonly<Record<string, Readonly<Record<string, string>>>>

const parseYaml = (content: string) =>
  Effect.try({
    catch: (cause) => new FailedToParseYaml({ cause, path: "pnpm-workspace.yaml" }),
    try: () => Yaml.parse(content),
  })

/**
 * The package patterns in a `pnpm-workspace.yaml`. A file that does not parse, or that has no
 * `packages` list, declares none.
 */
export const readPnpmWorkspacePatterns = (content: string) =>
  parseYaml(content).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(PnpmWorkspace)(parsed)),
    Effect.map(({ packages }) => packages),
    Effect.orElseSucceed(() => [])
  )

/**
 * The catalogs in a `pnpm-workspace.yaml`. A file that does not parse, or whose catalogs do not
 * decode, declares none.
 */
const readPnpmCatalogs = (content: string) =>
  parseYaml(content).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(PnpmCatalogs)(parsed)),
    Effect.map(({ catalog, catalogs = {} }) =>
      catalog === undefined ? catalogs : { ...catalogs, default: catalog }
    ),
    Effect.orElseSucceed(() => ({}))
  )

/**
 * The workspace declarations of the project. The patterns are the `packages` of
 * `pnpm-workspace.yaml`, or the `workspaces` of `package.json` when `pnpm-workspace.yaml` declares
 * none. A `pnpm-workspace.yaml` can hold only settings, such as `allowBuilds`.
 */
const readWorkspaceDeclarations = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const pnpmWorkspace = yield* readFileIfExists(path.join(cwd, "pnpm-workspace.yaml"))

    const [pnpmPatterns, catalogs] = Option.isSome(pnpmWorkspace)
      ? yield* Effect.all([
          readPnpmWorkspacePatterns(pnpmWorkspace.value),
          readPnpmCatalogs(pnpmWorkspace.value),
        ])
      : [[], {}]

    if (pnpmPatterns.length > 0) {
      return { catalogs, patterns: pnpmPatterns }
    }

    const { workspaces } = yield* readPackageJson(cwd)

    return {
      catalogs,
      patterns: (Array.isArray(workspaces) ? workspaces : workspaces?.packages) ?? [],
    }
  })

export const checkIsMonorepo = (cwd: string = process.cwd()) =>
  readWorkspaceDeclarations(cwd).pipe(Effect.map(({ patterns }) => patterns.length > 0))

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
 * The absolute directories of the workspace packages that the patterns select, without the root. A
 * package is a directory with a `package.json` that matches an include pattern and no `!` exclusion
 * pattern.
 */
const findPackageDirectories = (cwd: string, patterns: readonly string[]) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const includes = patterns.filter((pattern) => !pattern.startsWith("!"))

    const excludes = patterns.flatMap((pattern) =>
      pattern.startsWith("!") ? [workspacePatternToRegExp(pattern.slice(1))] : []
    )

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

/**
 * The workspace shape of the project. A project that declares workspace patterns is a monorepo,
 * also before any package exists.
 */
export interface Workspace {
  /**
   * The pnpm catalogs that `catalog:` dependency specifiers refer to.
   */
  readonly catalogs: Catalogs
  readonly isMonorepo: boolean
  /**
   * The absolute directories of the workspace packages, without the root.
   */
  readonly packageDirectories: readonly string[]
}

/**
 * Reads the workspace patterns one time, and finds the workspace packages that they select.
 */
export const readWorkspace = (cwd: string) =>
  Effect.gen(function* () {
    const { catalogs, patterns } = yield* readWorkspaceDeclarations(cwd)

    return {
      catalogs,
      isMonorepo: patterns.length > 0,
      packageDirectories: yield* findPackageDirectories(cwd, patterns),
    } satisfies Workspace
  })
