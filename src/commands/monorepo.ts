import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { sherif } from "#helpers/packages/sherif.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "monorepo",
  describe: "Find and fix monorepo-specific issues using Sherif",
  builder: (yargs) =>
    yargs.option("fix", {
      type: "boolean",
      description: "Automatically fix issues",
    }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args: string[] = []

      if (argv.fix) {
        args.push("--fix")
      }

      const command = dlxCommand(packageManager, sherif.name, { args })

      yield* runCommand(command)

      return ok(undefined)
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
