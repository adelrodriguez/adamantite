import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { biome } from "#commands/helpers.ts"
import {
  defineCommand,
  getPackageManagerName,
  handleCommandError,
} from "#utils.ts"

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
    try {
      const packageManager = await getPackageManagerName()

      const args = ["check"]

      if (argv.summary) {
        args.push("--reporter", "summary")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      execSync(dlxCommand(packageManager, biome.name, { args }), {
        stdio: "inherit",
      })
    } catch (error) {
      handleCommandError(error)
    }
  },
})
