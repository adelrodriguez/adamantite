import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { applySetup, offerRepair } from "#commands/setup.ts"
import * as Project from "#lib/project/index.ts"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"

export default Command.make("update", { json: Mode.json }).pipe(
  Command.withDescription(
    "Update managed packages, scripts, and files to this version, then offer the repair of setup issues"
  ),
  Command.withHandler(({ json }) =>
    Effect.gen(function* () {
      yield* Output.intro("💠 adamantite update")

      const project = yield* Project.read()

      const changed = yield* Option.match(project.lockfile, {
        onNone: () => Effect.as(offerRepair("update", null), false),
        onSome: (lockfile) => applySetup("update", project, lockfile.selection),
      })

      yield* Output.outro(changed ? "✅ Update finished." : "✅ No managed updates were applied.")
    }).pipe(Mode.provide({ json }))
  )
)
