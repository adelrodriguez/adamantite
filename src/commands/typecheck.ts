import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { typescript } from "#helpers/packages/typescript.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  builder: (yargs) =>
    yargs
      .option("project", {
        alias: "p",
        description: "Path to tsconfig.json file",
        type: "string",
      })
      .option("watch", {
        alias: "w",
        description: "Run in watch mode",
        type: "boolean",
      }),
  command: "typecheck",
  describe: "Run TypeScript type checking",
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["--noEmit"]

      if (argv.project) {
        args.push("--project", argv.project)
      }

      if (argv.watch) {
        args.push("--watch")
      }

      const command = dlxCommand(packageManager, typescript.command, { args })

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
