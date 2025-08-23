import { Command } from "commander"
import ci from "./commands/ci"
import format from "./commands/format"
import init from "./commands/init"
import lint from "./commands/lint"
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
  .command("lint")
  .description("Run Biome linter and fix files")
  .argument("[files...]", "specific files to lint (optional)")
  .option("--summary", "show summary of lint results")
  .action(async (files, options) => {
    await lint(files, options)
  })

program
  .command("format")
  .description("Run Biome formatter and fix files")
  .argument("[files...]", "specific files to format (optional)")
  .option("--unsafe", "apply unsafe fixes")
  .action(async (files, options) => {
    await format(files, options)
  })

program
  .command("monorepo")
  .description(
    "Lint and automatically fix monorepo-specific issues using Sherif"
  )
  .action(monorepo)

program
  .command("ci")
  .description("Run Biome CI")
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
