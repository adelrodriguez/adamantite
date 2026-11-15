import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
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

      // A project from before the lockfile gets the selection that its files show, one time.
      const selection = yield* Option.match(project.lockfile, {
        onNone: () =>
          Effect.tap(Setup.inferSelection(project), (inferred) =>
            Setup.checkIsEmptySelection(inferred)
              ? Effect.void
              : Output.info(
                  "The project has no lockfile, so update records the setup that the project files show."
                )
          ),
        onSome: (lockfile) => Effect.succeed(lockfile.selection),
      })

      // A project with no lockfile and no setup to record is not managed, so it stays as it is.
      const changed =
        Option.isNone(project.lockfile) && Setup.checkIsEmptySelection(selection)
          ? yield* Effect.as(offerRepair("update", cwd, null), false)
          : yield* applySetup("update", project, selection)

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
