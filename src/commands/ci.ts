import { cancel, log } from "@clack/prompts"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

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
    const result = await safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const tools = [
        {
          package: biome.name,
          args: ["ci", ...(argv.github ? ["--reporter", "github"] : [])],
        },
      ]

      if (argv.monorepo) {
        tools.push({ package: sherif.name, args: ["--fix"] })
      }

      for (const tool of tools) {
        const command = dlxCommand(packageManager, tool.package, {
          args: tool.args,
        })

        yield* runCommand(command, {
          stdio: "inherit",
        })
      }

      return ok(undefined)
    })

    if (result.isOk()) {
      return
    }

    const error = result.error

    log.error(`Failed while running CI checks: ${error.flatten()}`)

    cancel("Failed to run Adamantite")
  },
})
