import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { knip } from "#helpers/packages/knip.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  builder: (yargs) =>
    yargs
      .positional("files", {
        array: true,
        describe: "Specific files to analyze (optional)",
        type: "string",
      })
      .option("fix", {
        description: "Automatically fix issues",
        type: "boolean",
      })
      .option("strict", {
        description: "Enable strict mode",
        type: "boolean",
      }),
  command: "analyze [files..]",
  describe: "Find unused dependencies, exports, and files using knip",
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
