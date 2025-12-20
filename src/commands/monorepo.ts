import { cancel, log } from "@clack/prompts"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { sherif } from "#helpers/packages/sherif.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "monorepo",
  describe: "Lint and automatically fix monorepo-specific issues using Sherif",
  builder: (yargs) => yargs,
  handler: async () => {
    const result = await safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = ["--fix"]

      const command = dlxCommand(packageManager, sherif.name, { args })

      yield* runCommand(command, {
        stdio: "inherit",
      })

      return ok(undefined)
    })

    if (result.isOk()) {
      return
    }

    const error = result.error

    log.error(`Failed while linting monorepo: ${error.flatten()}`)

    cancel("Failed to run Adamantite")
  },
})
