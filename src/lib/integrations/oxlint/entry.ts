import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { resolveOxlintRuntime, toLaunch } from "#lib/integrations/oxlint/runtime.ts"
import { readSelection } from "#lib/project/lockfile.ts"
import { toToolNotSelected } from "#lib/project/selection.ts"

export const OXLINT_ENTRY_FILE = "oxlint.js"

export const EDITOR_OXLINT_ENTRY = `node_modules/adamantite/dist/${OXLINT_ENTRY_FILE}`

export const resolveOxlintLaunch = Effect.fn("resolveOxlintLaunch")(function* (project: string) {
  const runtime = yield* resolveOxlintRuntime(project).pipe(
    Effect.catchTag("PackageNotInstalled", (error) =>
      readSelection(project).pipe(
        Effect.flatMap((selection) =>
          Effect.fail(
            Option.getOrElse(toToolNotSelected(selection, error.packageName), () => error)
          )
        )
      )
    )
  )

  return yield* toLaunch(runtime)
})

export const getOxlintCommand = Effect.fn("getOxlintCommand")(function* (project: string) {
  const path = yield* Path.Path
  const { cli, env, preload } = yield* resolveOxlintLaunch(project)

  // A module path from the resolver is absolute, so its file URL is defined.
  const imports = yield* Option.match(preload, {
    onNone: () => Effect.succeed([]),
    onSome: (file) =>
      path.toFileUrl(file).pipe(
        Effect.map((url) => ["--import", url.href]),
        Effect.orDie
      ),
  })

  return { args: [...imports, cli], command: "node", cwd: project, env, name: "oxlint" } as const
})

export function getProjectDirectory(entry: string, cwd: string): string {
  const indexes = [entry.indexOf("/node_modules/"), entry.indexOf("\\node_modules\\")].filter(
    (index) => index !== -1
  )

  return indexes.length === 0 ? cwd : entry.slice(0, Math.min(...indexes))
}
