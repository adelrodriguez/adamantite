import { execSync } from "node:child_process"
import { defineCommand } from "citty"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default defineCommand({
  meta: {
    name: "monorepo",
    description:
      "Lint and automatically fix monorepo-specific issues using Sherif",
  },
  run: async () => {
    try {
      const packageManager = await getPackageManagerName()

      execSync(dlxCommand(packageManager, "sherif", { args: ["--fix"] }), {
        stdio: "inherit",
      })
    } catch (error) {
      handleCommandError(error)
    }
  },
})
