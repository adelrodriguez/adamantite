import process from "node:process"
import { log } from "@clack/prompts"
import { Fault } from "faultier"
import { ok, safeTry } from "neverthrow"
import { dlxCommand } from "nypm"
import { oxlint } from "#helpers/packages/oxlint.ts"
import { defineCommand, getPackageManagerName, runCommand } from "#utils.ts"

export default defineCommand({
  command: "fix [files..]",
  describe: "Fix issues in code using oxlint",
  builder: (yargs) =>
    yargs
      .positional("files", {
        describe: "Specific files to fix (optional)",
        type: "string",
        array: true,
      })
      .option("suggested", {
        type: "boolean",
        description: "Apply suggested fixes",
        default: false,
      })
      .option("dangerous", {
        type: "boolean",
        description: "Apply dangerous fixes",
        default: false,
      })
      .option("all", {
        type: "boolean",
        description: "Apply all fixes, including suggested and dangerous fixes",
        default: false,
      }),
  handler: (argv) =>
    safeTry(async function* () {
      const packageManager = yield* getPackageManagerName()

      const args = new Set<string>(["--type-aware", "--fix"])

      if (argv.suggested) {
        args.add("--fix-suggestions")
      }

      if (argv.dangerous) {
        args.add("--fix-dangerously")
      }

      if (argv.all) {
        args.add("--fix-suggestions")
        args.add("--fix-dangerously")
      }

      if (argv.files && argv.files.length > 0) {
        for (const file of argv.files) {
          args.add(file)
        }
      }

      const command = dlxCommand(packageManager, oxlint.name, { args: Array.from(args) })

      yield* runCommand(command)

      return ok()
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
