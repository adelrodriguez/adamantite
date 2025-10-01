import { execSync } from "node:child_process"
import { defineCommand } from "citty"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default defineCommand({
  meta: {
    name: "check",
    description: "Run Biome linter and check files for issues",
  },
  args: {
    files: {
      description: "Specific files to lint (optional)",
      type: "positional",
      required: false,
    },
    summary: {
      description: "Show summary of lint results",
      type: "boolean",
    },
  },
  run: async ({ args }) => {
    try {
      const packageManager = await getPackageManagerName()

      const biomeArgs = ["check"]

      if (args.summary) {
        biomeArgs.push("--reporter", "summary")
      }

      const files = args._

      if (files.length > 0) {
        biomeArgs.push(...files)
      }

      execSync(
        dlxCommand(packageManager, "@biomejs/biome", { args: biomeArgs }),
        {
          stdio: "inherit",
        }
      )
    } catch (error) {
      handleCommandError(error)
    }
  },
})
