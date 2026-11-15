import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import * as Output from "#terminal/output.ts"
import { applySetup, reportAssessment } from "./setup.ts"

export default Command.make("update").pipe(
  Command.withDescription(
    "Update managed packages, scripts, and files to this version, then report setup issues"
  ),
  Command.withHandler(() =>
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
      const { changed, findings } =
        Option.isNone(project.lockfile) && Setup.checkIsEmptySelection(selection)
          ? { changed: false, findings: yield* reportAssessment(cwd) }
          : yield* applySetup(project, selection)

      return !changed && findings.length === 0 ? ("no-changes" as const) : ("success" as const)
    }).pipe(
      Effect.tapError(() => Output.outro("❌ Update failed")),
      Effect.tap((value) =>
        Output.outro(
          value === "no-changes" ? "✅ No managed updates were applied." : "✅ Update finished."
        )
      )
    )
  )
)
