import { Command } from "commander"
import format from "./commands/format"
import init from "./commands/init"
import lint from "./commands/lint"
import monorepo from "./commands/monorepo"
import update from "./commands/update"
import version from "./commands/version"

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
  .action(lint)

program
  .command("format")
  .description("Run Biome formatter and fix files")
  .argument("[files...]", "specific files to format (optional)")
  .option("--unsafe", "apply unsafe fixes")
  .action(format)

program
  .command("monorepo")
  .description(
    "Lint and automatically fix monorepo-specific issues using Sherif"
  )
  .action(monorepo)

program
  .command("update")
  .description("Update adamantite dependencies to latest compatible versions")
  .action(update)

program.parse()
