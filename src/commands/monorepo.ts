import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
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

    if (Fault.isFault(result.error) && result.error.tag !== "NO_PACKAGE_MANAGER") {
      log.error(result.error.flatten())
    }

    process.exit(1)
  },
})
