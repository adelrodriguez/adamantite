import type * as Exit from "effect/Exit"
import type * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import type { FileSystemTestContext } from "#__tests__/filesystem.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  createDependencyInstallerTestContext,
  hashContent,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import doctorCommand from "#commands/doctor.ts"
import initCommand from "#commands/init.ts"
import updateCommand from "#commands/update.ts"

type RunOptions = Parameters<typeof runCommand>[2]

const widen = Effect.map((exit: Exit.Exit<unknown, unknown>) => exit)

const COMMANDS = {
  doctor: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(doctorCommand, args, options)),
  init: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(initCommand, args, options)),
  update: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(updateCommand, args, options)),
}

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

export function listHashes(files: FileSystemTestContext) {
  return Object.fromEntries(files.list().map((file) => [file, hashContent(files.read(file))]))
}

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
