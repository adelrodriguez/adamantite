import { execSync } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import defu from "defu"
import { Fault } from "faultier"
import { type ParseError, parse } from "jsonc-parser"
import { err, fromPromise, fromThrowable, ok } from "neverthrow"
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
  fromPromise(detectPackageManager(process.cwd()), () =>
    Fault.create("NO_PACKAGE_MANAGER").withDescription(
      "Error while detecting the package manager.",
      "We're unable to detect the package manager used in this project."
    )
  ).andThen((result) => {
    if (!result) {
      return err(
        Fault.create("NO_PACKAGE_MANAGER").withDescription(
          "No package manager detected.",
          "We're unable to detect the package manager used in this project."
        )
      )
    }

    return ok(result.name)
  })

export const checkIfExists = (path: string) =>
  fromPromise(access(path), () => new Error("File not found")).match(
    () => true,
    () => false
  )

export const parseJson = fromThrowable(parse, (error) =>
  Fault.wrap(error)
    .withTag("FAILED_TO_PARSE_FILE")
    .withDescription("Failed to parse JSON", "We're unable to parse the provided JSON file.")
)

export const mergeConfig = fromThrowable(defu, (error) =>
  Fault.wrap(error)
    .withTag("FAILED_TO_MERGE_CONFIG")
    .withDescription(
      "Failed to merge configuration",
      "We're unable to merge the configuration files."
    )
)

export const readPackageJson = (cwd = process.cwd()) => {
  const errors: ParseError[] = []
  return fromPromise(readFile(join(cwd, "package.json"), "utf-8"), (error) =>
    Fault.wrap(error)
      .withTag("FAILED_TO_READ_FILE")
      .withDescription(
        "Failed to read package.json",
        "We're unable to read the package.json file in the current directory."
      )
      .withContext({ path: join(cwd, "package.json") })
  )
    .andThen((content) => parseJson(content, errors))
    .andThen((parsed) => {
      if (errors.length > 0) {
        return err(
          Fault.create("FAILED_TO_PARSE_FILE")
            .withDescription(
              "Failed to parse JSON",
              "We're unable to parse the provided JSON file."
            )
            .withContext({ errors })
        )
      }

      return ok(parsed as PackageJson)
    })
}

export function getTitle() {
  const terminalWidth = process.stdout.columns || 80

  if (terminalWidth >= 120) {
    return `
               █████                                                 █████     ███   █████            
              ░░███                                                 ░░███     ░░░   ░░███             
  ██████    ███████   ██████   █████████████    ██████   ████████   ███████   ████  ███████    ██████ 
 ░░░░░███  ███░░███  ░░░░░███ ░░███░░███░░███  ░░░░░███ ░░███░░███ ░░░███░   ░░███ ░░░███░    ███░░███
  ███████ ░███ ░███   ███████  ░███ ░███ ░███   ███████  ░███ ░███   ░███     ░███   ░███    ░███████ 
 ███░░███ ░███ ░███  ███░░███  ░███ ░███ ░███  ███░░███  ░███ ░███   ░███ ███ ░███   ░███ ███░███░░░  
░░████████░░████████░░████████ █████░███ █████░░████████ ████ █████  ░░█████  █████  ░░█████ ░░██████ 
 ░░░░░░░░  ░░░░░░░░  ░░░░░░░░ ░░░░░ ░░░ ░░░░░  ░░░░░░░░ ░░░░ ░░░░░    ░░░░░  ░░░░░    ░░░░░   ░░░░░░                   
`
  }

  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                              ADAMANTITE                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`
}
