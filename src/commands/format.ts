import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "format [files..]",
  describe: "Format files using oxfmt",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to format (optional)",
        type: "string",
        array: true,
      })
      .option("check", {
        type: "boolean",
        description: "Check if files are formatted without writing",
      }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args: string[] = []

      if (argv.check) {
        args.push("--check")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, oxfmt.name, { args })

      const result = yield* runCommand(command)

      return ok(result)
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
