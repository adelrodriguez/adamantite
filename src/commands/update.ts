import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import { applySetup, offerRepair } from "./setup.ts"

export default Command.make("update", { json: Mode.json }).pipe(
  Command.withDescription(
    "Update managed packages, scripts, and files to this version, then offer the repair of setup issues"
  ),
  Command.withHandler(({ json }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      yield* Output.intro("💠 adamantite update")

      const project = yield* readProject(cwd)

      const changed = yield* Option.match(project.lockfile, {
        onNone: () =>
          Effect.gen(function* () {
            // A project from before the lockfile gets the selection that its files show, one time.
            const inferred = yield* Setup.inferSelection(project)

            // A project with no lockfile and no setup to record is not managed, so it stays as it
            // is.
            if (Setup.checkIsEmptySelection(inferred)) {
              return yield* Effect.as(offerRepair("update", cwd, null), false)
            }

            // The lint presets come from the root Oxlint config. While it does not load, the
            // inferred selection misses them, so update records nothing and hands off the
            // finding, and a later update infers the selection again.
            if (
              checkRunsTool(inferred.scripts, "oxlint")
              && Option.exists(project.lintConfig, Result.isFailure)
            ) {
              yield* Output.warning(
                "The project has no lockfile, and `oxlint.config.ts` does not load, so update cannot read the lint presets and records no setup. Repair the config, then run `adamantite update` again."
              )

              return yield* Effect.as(offerRepair("update", cwd, null), false)
            }

            yield* Output.info(
              "The project has no lockfile, so update records the setup that the project files show."
            )

            return yield* applySetup("update", project, inferred)
          }),
        onSome: (lockfile) => applySetup("update", project, lockfile.selection),
      })

      yield* Output.outro(changed ? "✅ Update finished." : "✅ No managed updates were applied.")
    }).pipe(
      // Findings that remain end the update with their own outro.
      Effect.tapError((error) =>
        Predicate.isTagged(error, "CommandFailed") ? Effect.void : Output.outro("❌ Update failed")
      ),
      Mode.provide({ json })
    )
  )
)
