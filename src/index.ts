import { Command } from "commander"
import check from "./commands/check"
import ci from "./commands/ci"
import fix from "./commands/fix"
import init from "./commands/init"
import monorepo from "./commands/monorepo"
import update from "./commands/update"
import version from "./version"

const program = new Command()

program.version(version)

program
  .name("adamantite")
  .description(
    "An opinionated set of presets for modern TypeScript applications"
  )

program
  .command("init")
  .description("Initialize Adamantite in the current directory")
  .action(init)

program
  .command("check")
  .description("Run Biome linter and check files for issues")
  .argument("[files...]", "specific files to lint (optional)")
  .option("--summary", "show summary of lint results")
  .action(async (files, options) => {
    await check(files, options)
  })

program
  .command("fix")
  .description("Run Biome linter and fix issues in files")
  .argument("[files...]", "specific files to fix (optional)")
  .option("--unsafe", "apply unsafe fixes")
  .action(async (files, options) => {
    await fix(files, options)
  })

program
  .command("monorepo")
  .description(
    "Lint and automatically fix monorepo-specific issues using Sherif"
  )
  .action(monorepo)

program
  .command("ci")
  .description("Run Adamantitte in a CI environment")
  .option("--monorepo", "run additional monorepo-specific checks")
  .option("--github", "use GitHub reporter")
  .action(async (options) => {
    await ci(options)
  })

program
  .command("update")
  .description("Update adamantite dependencies to latest compatible versions")
  .action(update)

program.parse()
