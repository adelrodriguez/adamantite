import process from "node:process"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "fix [files..]",
  describe: "Run Biome linter and fix issues in files",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to fix (optional)",
        type: "string",
        array: true,
      })
      .option("unsafe", {
        type: "boolean",
        description: "Apply unsafe fixes",
      }),
  handler: async (argv) => {
    const result = await safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["check", "--write"]

      if (argv.unsafe) {
        args.push("--unsafe")
      }

      if (argv.files && argv.files.length > 0) {
        args.push(...argv.files)
      }

      const command = dlxCommand(packageManager, biome.name, { args })

      yield* runCommand(command, {
        stdio: "inherit",
      })

      return ok(undefined)
    })

    if (result.isOk()) {
      return
    }

    process.exit(1)
  },
})
