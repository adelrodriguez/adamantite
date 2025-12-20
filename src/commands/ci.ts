import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import {
  defineCommand,
  getPackageManagerName,
  handleCommandError,
} from "#utils.ts"

export default defineCommand({
  command: "ci",
  describe: "Run Adamantite in a CI environment",
  builder: (yargs) =>
    yargs
      .option("monorepo", {
        type: "boolean",
        description: "Run additional monorepo-specific checks",
      })
      .option("github", {
        type: "boolean",
        description: "Use GitHub reporter",
      }),
  handler: async (argv) => {
    try {
      const packageManager = await getPackageManagerName()
      const tools = [
        {
          package: "@biomejs/biome",
          args: ["ci", ...(argv.github ? ["--reporter", "github"] : [])],
        },
        ...(argv.monorepo ? [{ package: "sherif", args: [] }] : []),
      ]
      for (const tool of tools) {
        execSync(
          dlxCommand(packageManager, tool.package, { args: tool.args }),
          {
            stdio: "inherit",
          }
        )
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})
