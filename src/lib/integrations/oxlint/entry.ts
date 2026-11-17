import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { resolveOxlintRuntime, toLaunch } from "#lib/integrations/oxlint/runtime.ts"
import { readSelection } from "#lib/project/lockfile.ts"
import { toToolNotSelected } from "#lib/project/selection.ts"

/**
 * The file name of the entry that runs Oxlint with the project's Oxlint runtime, for editors. The
 * build writes it beside the CLI bundle, as `dist/oxlint.js`. `scripts/test-build.ts` checks that
 * the build writes it.
 */
export const OXLINT_ENTRY_FILE = "oxlint.js"

/**
 * The entry as an editor in the target project starts it, relative to the workspace folder.
 */
export const EDITOR_OXLINT_ENTRY = `node_modules/adamantite/dist/${OXLINT_ENTRY_FILE}`

/**
 * How to start Oxlint for the project at `project`, with its Oxlint runtime. Without a selected
 * script that runs Oxlint, Setup did not install it, and `adamantite update` would not either, so a
 * missing Oxlint fails with `ToolNotSelected`, which names the script to add.
 */
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

/**
 * The `CommandRunner` command that runs Oxlint for the project at `project`, with its Oxlint
 * runtime. Node.js starts Oxlint's CLI module, after the preload module of a plugin, so the CLI
 * loads Effect once, and no entry process resolves the runtime again. Arguments go after `args`.
 */
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

/**
 * The project that the entry runs Oxlint for. An editor starts the entry from the project's
 * `node_modules`, so the project is the folder above the first `node_modules` folder in the entry
 * path. The first `node_modules` also covers a package manager store inside the project, such as
 * `node_modules/.pnpm/`. The Adamantite repository starts the entry as `src/oxlint/index.ts`,
 * outside `node_modules`, so there the project is `cwd`.
 */
export function getProjectDirectory(entry: string, cwd: string): string {
  const indexes = [entry.indexOf("/node_modules/"), entry.indexOf("\\node_modules\\")].filter(
    (index) => index !== -1
  )

  return indexes.length === 0 ? cwd : entry.slice(0, Math.min(...indexes))
}
