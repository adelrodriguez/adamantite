import { execSync } from "node:child_process"
import { defineCommand } from "citty"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default defineCommand({
  meta: {
    name: "ci",
    description: "Run Adamantite in a CI environment",
  },
  args: {
    monorepo: {
      description: "Run additional monorepo-specific checks",
      type: "boolean",
    },
    github: {
      description: "Use GitHub reporter",
      type: "boolean",
    },
  },
  run: async ({ args }) => {
    try {
      const packageManager = await getPackageManagerName()
      const tools = [
        {
          package: "@biomejs/biome",
          args: ["ci", ...(args.github ? ["--reporter", "github"] : [])],
        },
        ...(args.monorepo ? [{ package: "sherif", args: [] }] : []),
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
