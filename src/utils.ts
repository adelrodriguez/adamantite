import type { JsonObject, JsonValue, PackageJson } from "type-fest"
import type { CommandModule } from "yargs"

import { spawnSync } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { defu } from "defu"
import { Fault } from "faultier"
import { type ParseError, parse } from "jsonc-parser"
import { err, fromPromise, fromThrowable, ok, safeTry } from "neverthrow"
import { detectPackageManager } from "nypm"

export function defineCommand<T, U>(input: CommandModule<T, U>): CommandModule<T, U> {
  return input
}

export const runCommand = (command: string) => {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    maxBuffer: 100 * 1024 * 1024,
  })

  if (result.error || result.status !== 0) {
    const message = result.error?.message ?? "An unknown error occurred while running the command"

    return err(
      Fault.wrap(result.error ?? new Error(message))
        .withTag("FAILED_TO_RUN_COMMAND")
        .withDebug(`Failed to run command: ${message}`)
    )
  }

  return ok(result)
}

export const getPackageManagerName = () =>
  fromPromise(
    detectPackageManager(process.cwd()),
    () => "Failed to detect package manager" as const
  )
    .andThen((result) =>
      result ? ok(result.name) : err("Failed to resolve package manager" as const)
    )
    .mapErr((message) =>
      Fault.create("NO_PACKAGE_MANAGER").withDescription(
        message,
        "We're unable to detect the package manager used in this project. Please ensure you have a package.json file in the current directory."
      )
    )

export const checkIfExists = (path: string) =>
  fromPromise(access(path), () => new Error("File not found")).match(
    () => true,
    () => false
  )

export const parseJson = (content: string) => {
  const errors: ParseError[] = []

  const parsed = parse(content, errors) as JsonValue

  if (errors.length > 0) {
    return err(
      Fault.create("FAILED_TO_PARSE_FILE")
        .withDescription("Failed to parse JSON", "We're unable to parse the provided JSON file.")
        .withContext({ errors })
    )
  }
  return ok(parsed)
}

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

export const mergeConfig = fromThrowable(defu, (error) =>
  Fault.wrap(error)
    .withTag("FAILED_TO_MERGE_CONFIG")
    .withDescription(
      "Failed to merge configuration",
      "We're unable to merge the configuration files."
    )
)

export const readPackageJson = (cwd = process.cwd()) =>
  fromPromise(readFile(join(cwd, "package.json"), "utf8"), (error) =>
    Fault.wrap(error)
      .withTag("FAILED_TO_READ_FILE")
      .withDescription(
        "Failed to read package.json",
        "We're unable to read the package.json file in the current directory."
      )
      .withContext({ path: join(cwd, "package.json") })
  )
    .andThen((content) => parseJson(content))
    .andThen((parsed) => ok(parsed as unknown as PackageJson))

export const checkIsMonorepo = () =>
  safeTry(async function* () {
    const pnpmWorkspace = await checkIfExists(join(process.cwd(), "pnpm-workspace.yaml"))

    if (pnpmWorkspace) {
      return ok(true)
    }

    const packageJson = yield* readPackageJson()

    return ok(packageJson?.workspaces !== undefined)
  })

export function printTitle() {
  // Roman style ASCII art
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

  if (process.stdout.columns && process.stdout.columns >= columns) {
    console.info(title)
  }
}
