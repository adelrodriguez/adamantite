import { delimiter } from "node:path"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { CommandRunner } from "#lib/execution/command-runner.ts"

// The `effecttsgo` rules exist only in the patched Oxlint and oxlint-tsgolint binaries. The patched
// `tsc` gives editors Effect quick fixes, refactors, and hovers.
const PATCH_ARGS = ["patch", "--oxlint", "--typescript"]

/**
 * Patch the installed Oxlint, oxlint-tsgolint, and TypeScript binaries. The project's
 * `node_modules/.bin` goes first on `PATH`, because a runner such as `pnpm dlx` does not add it.
 * The patch reports each file it skips, so `quiet` keeps that output out of a spinner.
 */
export const runPatch = Effect.fn("runEffectTsgoPatch")(function* (
  cwd: string,
  options: { readonly quiet: boolean }
) {
  const path = yield* Path.Path
  const runner = yield* CommandRunner
  const output = options.quiet ? "ignore" : "inherit"
  const inheritedPath = yield* Config.String("PATH").pipe(Config.withDefault(""))
  const searchPath = [path.join(cwd, "node_modules", ".bin"), inheritedPath]
    .filter(Boolean)
    .join(delimiter)

  yield* runner.run({
    args: PATCH_ARGS,
    command: "effect-tsgo",
    cwd,
    env: { PATH: searchPath },
    stderr: output,
    stdout: output,
  })
})
