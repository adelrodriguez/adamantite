#!/usr/bin/env node

import { Command } from "commander"
import format from "./actions/format"
import init from "./actions/init"
import lint from "./actions/lint"
import version from "./actions/version"

const program = new Command()

program.version(version)

program
  .name("Adamantite")
  .description(
    "An opinionated set of presets for modern TypeScript applications."
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
