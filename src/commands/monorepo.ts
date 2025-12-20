import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import {
  defineCommand,
  getPackageManagerName,
  handleCommandError,
} from "#utils.ts"

export default defineCommand({
  command: "monorepo",
  describe: "Lint and automatically fix monorepo-specific issues using Sherif",
  builder: (yargs) => yargs,
  handler: async () => {
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
