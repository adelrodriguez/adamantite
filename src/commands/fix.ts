import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "fix [files..]",
  describe: "Fix issues in code using Biome",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to fix (optional)",
        type: "string",
        array: true,
      })
      .option("unsafe", {
        type: "boolean",
        description: "Apply unsafe fixes",
      }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["check", "--write"]

      if (argv.unsafe) {
        args.push("--unsafe")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, biome.name, { args })

      yield* runCommand(command, {
        stdio: "inherit",
      })

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
