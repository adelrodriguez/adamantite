import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { biome } from "#commands/helpers.ts"
import {
  defineCommand,
  getPackageManagerName,
  handleCommandError,
} from "#utils.ts"

export default defineCommand({
  command: "fix",
  describe: "Run Biome linter and fix issues in files",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to fix (optional)",
        type: "string",
      })
      .option("unsafe", {
        type: "boolean",
        description: "Apply unsafe fixes",
      }),
  handler: async (argv) => {
    try {
      const packageManager = await getPackageManagerName()

      const args = ["check", "--write"]

      if (argv.unsafe) {
        args.push("--unsafe")
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
