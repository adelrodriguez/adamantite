import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

export default Command.make("prepare").pipe(
  Command.withDescription(
    "Patch Oxlint and TypeScript for the effect preset. The `prepare` script runs it after each install"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()

      if (yield* effectTsgo.checkNeedsPatch(cwd, yield* readPackageJson(cwd))) {
        yield* effectTsgo.patch(cwd, { quiet: false })
      }
    })
  )
)
