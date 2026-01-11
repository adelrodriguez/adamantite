import process from "node:process"
import type { JsonObject, JsonValue, PackageJson } from "type-fest"
import { Command as ShellCommand, FileSystem, Path, Terminal } from "@effect/platform"
import { defu } from "defu"
import { Console, Effect } from "effect"
import { type ParseError, parse } from "jsonc-parser"
import {
  CliNotFound,
  FailedToCreateDirectory,
  FailedToMergeConfig,
  FailedToParseFile,
  FailedToReadFile,
  MissingPackageVersion,
} from "#errors.ts"
import { Cwd } from "#services/cwd.ts"

export const checkCliExists = (command: string) => {
  const executable = process.platform === "win32" ? "where" : "which"

  return ShellCommand.make(executable, command).pipe(
    ShellCommand.exitCode,
    Effect.flatMap((exitCode) =>
      exitCode === 0 ? Effect.succeed(true) : Effect.fail(new CliNotFound({ command }))
    )
  )
}

export const parseJson = (content: string, path?: string) =>
  Effect.sync(() => {
    const errors: ParseError[] = []
    const parsed = parse(content, errors) as JsonValue
    return { errors, parsed }
  }).pipe(
    Effect.flatMap(({ errors, parsed }) =>
      errors.length > 0
        ? Effect.fail(new FailedToParseFile({ errors, path }))
        : Effect.succeed(parsed)
    )
  )

export const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const WORKSPACE_PREFIX_REGEX = /^workspace:/
const RANGE_PREFIX_REGEX = /^[\^~]/

/**
 * Normalize a dependency version specifier (e.g. `^1.2.3`, `~1.2.3`) to its bare version.
 * This is useful when comparing package.json ranges to pinned versions.
 */
export const normalizeDependencyVersion = (specifier: string) =>
  specifier.trim().replace(WORKSPACE_PREFIX_REGEX, "").replace(RANGE_PREFIX_REGEX, "")

export const mergeConfig = <A extends object, B extends object>(base: A, override: B) =>
  Effect.try({
    catch: (cause) => new FailedToMergeConfig({ cause }),
    try: () => defu(base, override),
  })

export const readPackageJson = (cwd?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwdService = yield* Cwd
    const workingDir = cwd ?? (yield* cwdService.get)
    const packagePath = path.join(workingDir, "package.json")
    const content = yield* fs
      .readFileString(packagePath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: packagePath })))
    const parsed = yield* parseJson(content, packagePath)
    return parsed as PackageJson
  })

export const checkIsMonorepo = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* Cwd
    const currentDir = yield* cwd.get
    const pnpmWorkspace = yield* fs.exists(path.join(currentDir, "pnpm-workspace.yaml"))

    if (pnpmWorkspace) {
      return true
    }

    const packageJson = yield* readPackageJson()

    return packageJson?.workspaces !== undefined
  })

export const ensureDirectory = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs
      .makeDirectory(path, { recursive: true })
      .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path })))
  })

export const printTitle = () =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal
    const terminalColumns = yield* terminal.columns

    const title = `
                .o8                                                        .    o8o      .            
               "888                                                      .o8    \`"'    .o8            
 .oooo.    .oooo888   .oooo.   ooo. .oo.  .oo.    .oooo.   ooo. .oo.   .o888oo oooo  .o888oo  .ooooo. 
\`P  )88b  d88' \`888  \`P  )88b  \`888P"Y88bP"Y88b  \`P  )88b  \`888P"Y88b    888   \`888    888   d88' \`88b
 .oP"888  888   888   .oP"888   888   888   888   .oP"888   888   888    888    888    888   888ooo888
d8(  888  888   888  d8(  888   888   888   888  d8(  888   888   888    888 .  888    888 . 888    .o
\`Y888""8o \`Y8bod88P" \`Y888""8o o888o o888o o888o \`Y888""8o o888o o888o   "888" o888o   "888" \`Y8bod8P'
`

    const columns = title.split("\n").reduce((max, line) => Math.max(max, line.trim().length), 0)

    if (!terminalColumns || terminalColumns < columns) {
      return
    }

    yield* Console.info(title)
  })

export const getPackageVersion = () =>
  readPackageJson().pipe(
    Effect.flatMap((packageJson) =>
      packageJson.version
        ? Effect.succeed(packageJson.version)
        : Effect.fail(new MissingPackageVersion({ path: "package.json" }))
    )
  )
