import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { knip } from "#helpers/packages/knip.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "analyze [files..]",
  describe: "Find unused dependencies, exports, and files using knip",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to analyze (optional)",
        type: "string",
        array: true,
      })
      .option("fix", {
        type: "boolean",
        description: "Automatically fix issues",
      })
      .option("strict", {
        type: "boolean",
        description: "Enable strict mode",
      }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args: string[] = []

      if (argv.fix) {
        args.push("--fix", "--allow-remove-files")
      }

      if (argv.strict) {
        args.push("--production", "--strict")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, knip.name, { args })

      yield* runCommand(command)

      return ok()
    }).match(
      () => {
        // Exit the process with success code
        process.exit(0)
      },
      (error) => {
        if (Fault.isFault(error) && error.tag === "NO_PACKAGE_MANAGER") {
          log.error(error.flatten())
        }

        process.exit(1)
      }
    ),
})
