import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import { getPluginsToPrepare } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { Prompter } from "#terminal/prompter.ts"

export default Command.make("prepare").pipe(
  Command.withDescription(
    "Run the install steps of managed plugins, such as the @effect/tsgo patch. The `prepare` script runs it after each install"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const plugins = yield* getPluginsToPrepare(cwd, yield* readPackageJson(cwd))

      for (const plugin of plugins) {
        yield* plugin.prepare(cwd)
        yield* prompter.log.success(`Prepared ${plugin.name}.`)
      }
    })
  )
)
