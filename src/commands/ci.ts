import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
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
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const tools = [
        {
          package: biome.name,
          args: ["ci", ...(argv.github ? ["--reporter", "github"] : [])],
        },
      ]

      if (argv.monorepo) {
        tools.push({ package: sherif.name, args: [] })
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
    }).match(
      () => {
        // Exit the process with success code
        process.exit(0)
      },
      (error) => {
        if (Fault.isFault(error) && error.tag === "NO_PACKAGE_MANAGER") {
          log.error(error.flatten())
        }

        process.exit(1)
      }
    ),
})
