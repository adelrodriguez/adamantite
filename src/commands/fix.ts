import { execSync } from "node:child_process"
import { defineCommand } from "citty"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default defineCommand({
  meta: {
    name: "fix",
    description: "Run Biome linter and fix issues in files",
  },
  args: {
    files: {
      description: "Specific files to fix (optional)",
      type: "positional",
      required: false,
    },
    unsafe: {
      description: "Apply unsafe fixes",
      type: "boolean",
    },
  },
  run: async ({ args }) => {
    try {
      const packageManager = await getPackageManagerName()

      const biomeArgs = ["check", "--write"]

      if (args.unsafe) {
        biomeArgs.push("--unsafe")
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
