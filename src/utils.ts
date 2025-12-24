import { execSync } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import defu from "defu"
import { Fault } from "faultier"
import { type ParseError, parse } from "jsonc-parser"
import { err, fromPromise, fromThrowable, ok, safeTry } from "neverthrow"
import { detectPackageManager } from "nypm"
import type { PackageJson } from "type-fest"
import type { CommandModule } from "yargs"

export function defineCommand<T, U>(input: CommandModule<T, U>): CommandModule<T, U> {
  return input
}

export const runCommand = fromThrowable(execSync, (error) =>
  Fault.wrap(error).withTag("FAILED_TO_RUN_COMMAND")
)

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

  const parsed = parse(content, errors)

  if (errors.length > 0) {
    return err(
      Fault.create("FAILED_TO_PARSE_FILE")
        .withDescription("Failed to parse JSON", "We're unable to parse the provided JSON file.")
        .withContext({ errors })
    )
  }
  return ok(parsed)
}

export const mergeConfig = fromThrowable(defu, (error) =>
  Fault.wrap(error)
    .withTag("FAILED_TO_MERGE_CONFIG")
    .withDescription(
      "Failed to merge configuration",
      "We're unable to merge the configuration files."
    )
)

export const readPackageJson = (cwd = process.cwd()) =>
  fromPromise(readFile(join(cwd, "package.json"), "utf-8"), (error) =>
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

const TITLE = `
     o      ooooooooo      o      oooo     oooo      o      oooo   oooo ooooooooooo ooooo ooooooooooo ooooooooooo
    888      888    88o   888      8888o   888      888      8888o  88  88  888  88  888  88  888  88  888    88 
   8  88     888    888  8  88     88 888o8 88     8  88     88 888o88      888      888      888      888ooo8   
  8oooo88    888    888 8oooo88    88  888  88    8oooo88    88   8888      888      888      888      888    oo 
o88o  o888o o888ooo88 o88o  o888o o88o  8  o88o o88o  o888o o88o    88     o888o    o888o    o888o    o888ooo8888                                                                       
`

export function printTitle() {
  const columns = TITLE.split("\n").reduce((max, line) => Math.max(max, line.trim().length), 0)

  if (process.stdout.columns && process.stdout.columns >= columns) {
    // biome-ignore lint/suspicious/noConsole: we're using console.log to print the title
    console.log(TITLE)
  }
}
