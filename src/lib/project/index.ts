import type * as FileSystem from "effect/FileSystem"
import type * as Result from "effect/Result"
import { cwd } from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import type { LintConfig } from "#lib/project/lint-config.ts"
import {
  type CustomRuleDiscovery,
  discoverCustomRules,
} from "#lib/project/custom-rules/discover.ts"
import { type Lockfile, readLockfile } from "#lib/project/lockfile.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import {
  type ConfigLoadFailed,
  FailedToParseYaml,
  type FailedToReadFile,
} from "#lib/shared/errors.ts"
import { readDirectoryIfExists, readFileIfExists } from "#lib/shared/filesystem.ts"

export class Directory extends Context.Service<Directory, string>()(
  "adamantite/Project/Directory"
) {
  static readonly layer = Layer.sync(this, cwd)
}

const PnpmWorkspace = Schema.Struct({ packages: Schema.Array(Schema.String) })

// YAML reads an unquoted version such as `6` as a number, and pnpm reads it as that version.
const CatalogSpecifier = Schema.Union([
  Schema.String,
  Schema.Finite.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({
        decode: String,
        encode: Number,
      })
    )
  ),
])

const Catalog = Schema.Record(Schema.String, CatalogSpecifier)

const PnpmCatalogs = Schema.Struct({
  catalog: Schema.optionalKey(Catalog),
  catalogs: Schema.optionalKey(Schema.Record(Schema.String, Catalog)),
})

export type Catalogs = Readonly<Record<string, Readonly<Record<string, string>>>>

const parseYaml = (content: string) =>
  Effect.try({
    catch: (cause) => new FailedToParseYaml({ cause, path: "pnpm-workspace.yaml" }),
    try: () => Yaml.parse(content),
  })

const readPnpmWorkspacePatterns = (content: string) =>
  parseYaml(content).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(PnpmWorkspace)(parsed)),
    Effect.map(({ packages }) => packages),
    Effect.orElseSucceed(() => [])
  )

const readPnpmCatalogs = (content: string) =>
  parseYaml(content).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknownEffect(PnpmCatalogs)(parsed)),
    // pnpm names the `catalog` field the `default` catalog.
    Effect.map(({ catalog, catalogs = {} }) =>
      catalog === undefined ? catalogs : { ...catalogs, default: catalog }
    ),
    Effect.orElseSucceed(() => ({}))
  )

const readWorkspaceDeclarations = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const pnpmWorkspace = yield* readFileIfExists(path.join(cwd, "pnpm-workspace.yaml"))

    const [pnpmPatterns, catalogs] = Option.isSome(pnpmWorkspace)
      ? yield* Effect.all(
          [readPnpmWorkspacePatterns(pnpmWorkspace.value), readPnpmCatalogs(pnpmWorkspace.value)],
          { concurrency: 1 }
        )
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

export const checkIsMonorepo = Effect.fn("Project.checkIsMonorepo")(function* () {
  const { patterns } = yield* readWorkspaceDeclarations(yield* Directory)

  return patterns.length > 0
})

function escapeRegExp(text: string) {
  return text.replaceAll(/[$()+.[\\\]^{|}]/gu, String.raw`\$&`)
}

function workspacePatternToRegExp(pattern: string): RegExp {
  const segments = pattern.replace(/^\.\//u, "").replace(/\/+$/u, "").split("/")
  let source = ""

  for (const [index, segment] of segments.entries()) {
    const followsGlobstar = segments[index - 1] === "**"
    const separator = index === 0 || followsGlobstar ? "" : "/"

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

export interface Workspace {
  readonly catalogs: Catalogs
  readonly isMonorepo: boolean
  readonly packageDirectories: readonly string[]
}

export const readWorkspace = Effect.fn("Project.readWorkspace")(function* () {
  const directory = yield* Directory
  const { catalogs, patterns } = yield* readWorkspaceDeclarations(directory)

  return {
    catalogs,
    isMonorepo: patterns.length > 0,
    packageDirectories: yield* findPackageDirectories(directory, patterns),
  } satisfies Workspace
})

const LINT_CONFIG_FILE = "oxlint.config.ts"

export interface Snapshot {
  readonly customRules: CustomRuleDiscovery
  readonly lintConfig: Option.Option<Result.Result<LintConfig, ConfigLoadFailed>>
  readonly lockfile: Option.Option<Lockfile>
  readonly packageJson: PackageJson
  readonly workspace: Workspace
}

export const read = Effect.fn("Project.read")(function* () {
  const directory = yield* Directory
  const path = yield* Path.Path

  const [packageJson, workspace, lockfile] = yield* Effect.all(
    [readPackageJson(directory), readWorkspace(), readLockfile(directory)],
    { concurrency: "unbounded" }
  )

  const customRules = yield* discoverCustomRules(directory, [
    directory,
    ...workspace.packageDirectories,
  ])

  const lintConfig = Option.fromUndefinedOr(
    customRules.reads.get(path.join(directory, LINT_CONFIG_FILE))
  )

  return { customRules, lintConfig, lockfile, packageJson, workspace } satisfies Snapshot
})
