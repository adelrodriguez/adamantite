import { Command } from "commander"
import format from "./commands/format"
import init from "./commands/init"
import lint from "./commands/lint"
import version from "./commands/version"

const program = new Command()

program.version(version)

program
  .name("Adamantite")
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
  .action(lint)

program
  .command("format")
  .description("Run Biome formatter and fix files")
  .argument("[files...]", "specific files to format (optional)")
  .option("--unsafe", "apply unsafe fixes")
  .action(format)

program.parse()
