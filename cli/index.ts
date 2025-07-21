#!/usr/bin/env node

import { Command } from "commander"
import format from "./actions/format"
import lint from "./actions/lint"
import { getPackageVersion } from "./utils"

const version = getPackageVersion()

const program = new Command()

program.version(version)

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
