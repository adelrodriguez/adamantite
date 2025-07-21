import { Command } from "commander"
import lint from "~/actions/lint"
import format from "./actions/format"

const VERSION = "0.0.2"

const program = new Command()

program.version(VERSION)

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
