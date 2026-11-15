import type * as Exit from "effect/Exit"
import type * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import type { FileSystemTestContext } from "#__tests__/filesystem.ts"
import type { Selection } from "#lib/project/selection.ts"
import doctorCommand from "#commands/doctor.ts"
import initCommand from "#commands/init/index.ts"
import updateCommand from "#commands/update.ts"
import {
  createDependencyInstallerTestContext,
  hashContent,
  runCommand,
} from "./command-test-helpers.ts"

type RunOptions = Parameters<typeof runCommand>[2]

// One exit type for the three commands, so a test reads each exit the same way.
const widen = Effect.map((exit: Exit.Exit<unknown, unknown>) => exit)

const COMMANDS = {
  doctor: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(doctorCommand, args, options)),
  init: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(initCommand, args, options)),
  update: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(updateCommand, args, options)),
}

/**
 * Runs `init`, `update`, or `doctor` in `files` with an installer that installs nothing, and
 * returns the exit and the output lines.
 */
export function runLifecycle(
  command: keyof typeof COMMANDS,
  files: FileSystemTestContext,
  args: readonly string[] = [],
  layers: ReadonlyArray<Layer.Layer<never>> = []
) {
  return Effect.gen(function* () {
    const logLines: unknown[] = []

    const exit = yield* COMMANDS[command](args, {
      files,
      layers: [createDependencyInstallerTestContext().layer, ...layers],
      logLines,
    })

    return { exit, output: logLines.join("\n") }
  })
}

/**
 * The hash of each file in `files`, by its path.
 */
export function listHashes(files: FileSystemTestContext) {
  return Object.fromEntries(files.list().map((file) => [file, hashContent(files.read(file))]))
}

/**
 * A selection with nothing in it but `parts`.
 */
export function makeSelection(parts: Partial<Selection>): Selection {
  return {
    agents: false,
    ci: null,
    editors: [],
    presets: [],
    scripts: [],
    typescript: null,
    ...parts,
  }
}
