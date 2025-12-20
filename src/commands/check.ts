import { cancel, log } from "@clack/prompts"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "check",
  describe: "Run Biome linter and check files for issues",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to lint (optional)",
        type: "string",
      })
      .option("summary", {
        type: "boolean",
        description: "Show summary of lint results",
      }),
  handler: async (argv) => {
    const result = await safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["check"]

      if (argv.summary) {
        args.push("--reporter", "summary")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, biome.name, { args })

      yield* runCommand(command, { stdio: "inherit" })

      return ok(undefined)
    })

    if (result.isOk()) {
      return
    }

    const error = result.error

    log.error(`Failed while checking for issues: ${error.flatten()}`)

    cancel("Failed to run Adamantite")
  },
})
