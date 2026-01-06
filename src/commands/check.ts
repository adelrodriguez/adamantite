import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { oxlint } from "#helpers/packages/oxlint.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  builder: (yargs) =>
    yargs.positional("files", {
      array: true,
      describe: "Specific files to lint (optional)",
      type: "string",
    }),
  command: "check [files..]",
  describe: "Find issues in code using oxlint",
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args: string[] = ["--type-aware"]

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, oxlint.name, { args })

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
