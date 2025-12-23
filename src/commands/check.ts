import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "check [files..]",
  describe: "Find issues in code using Biome",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to lint (optional)",
        type: "string",
        array: true,
      })
      .option("summary", {
        type: "boolean",
        description: "Show summary of lint results",
      }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["check"]

      if (argv.summary) {
        args.push("--reporter", "summary")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, biome.name, { args })

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
