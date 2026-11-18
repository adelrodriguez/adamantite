import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { AgentReach, BrokenLink } from "#lib/hardening/agent-reach.ts"
import { assessProject } from "#lib/assessment/index.ts"
import * as Bridge from "#lib/bridge/index.ts"
import {
  DEFAULT_FIX_HISTORY_COMMITS,
  HardenContext,
  readHardenContext,
  readHardenReach,
  renderHardenPrompt,
} from "#lib/hardening/index.ts"
import * as Project from "#lib/project/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import {
  AdamantiteNotInNodeModules,
  AdamantiteNotInstalled,
  AdamantiteVersionMismatch,
  FailedToReadFile,
  ScopeOutsideProject,
} from "#lib/shared/errors.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import * as Resolution from "#terminal/resolution.ts"

const version = getPackageVersion()

/**
 * What `harden --json` prints: the harden context that the prompt is built from.
 */
export const Report = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  ...HardenContext.fields,
})

function getLinkKey(link: BrokenLink) {
  return `${link.file}\0${link.target}`
}

/**
 * The version of the Adamantite that the project at `cwd` loads, or none when it is not installed.
 * It resolves `adamantite/lint` as Oxlint loads the preset, so an install in a parent
 * `node_modules` counts.
 */
const readInstalledVersion = Effect.fn("readInstalledVersion")(function* (cwd: string) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver
  const entry = yield* resolver.resolve(cwd, publicImport("./lint"))

  if (Option.isNone(entry)) {
    return Option.none<string>()
  }

  for (
    let directory = path.dirname(entry.value);
    directory !== path.dirname(directory);
    directory = path.dirname(directory)
  ) {
    const manifest = yield* readPackageJson(directory).pipe(Effect.option)

    if (Option.isSome(manifest) && manifest.value.name === "adamantite") {
      return Option.fromUndefinedOr(manifest.value.version)
    }
  }

  return Option.none<string>()
})

const scope = Flag.Directory("path", { mustExist: true }).pipe(
  Flag.optional,
  Flag.withDescription(
    "Limit the session to a project folder or workspace package. The path is relative to the current directory"
  )
)

const commits = Flag.Int("commits").pipe(
  Flag.withSchema(
    Schema.Int.pipe(
      Schema.check(Schema.isGreaterThan(0, { message: "`--commits` must be a positive number" }))
    )
  ),
  Flag.withDefault(DEFAULT_FIX_HISTORY_COMMITS),
  Flag.withDescription("Set how many recent commits the agent reads to find past fixes")
)

/**
 * What remains after a harden session. The agent verifies custom rules during the session with
 * temporary cases, and the project must still pass check and Doctor after it. A link that was
 * broken before the session is a gap that the user may not have approved, so only a link that the
 * session added remains.
 */
const verify = Effect.fn("verify")(function* (
  cwd: string,
  scope: string,
  reachBefore: Option.Option<AgentReach>
) {
  const CHECK_FAILED = "`adamantite check` failed."

  const checkFailures = yield* Bridge.check().pipe(
    Effect.as([]),
    Effect.catchTags({
      CliNotFound: (error) => Effect.succeed([error.message, CHECK_FAILED]),
      CommandFailed: () => Effect.succeed([CHECK_FAILED]),
    })
  )

  // The session can change the project, so agent reach and assessment share a new read.
  const project = yield* Project.read()

  const [reachAfter, assessment] = yield* Effect.all(
    [readHardenReach(cwd, project.workspace, scope), assessProject(project)],
    { concurrency: "unbounded" }
  )

  const brokenBefore = new Set(
    Option.match(reachBefore, {
      onNone: () => [],
      onSome: (reach) => reach.brokenLinks.map((link) => getLinkKey(link)),
    })
  )

  const addedBrokenLinks = Option.match(reachAfter, {
    onNone: () => [],
    onSome: (reach) => reach.brokenLinks.filter((link) => !brokenBefore.has(getLinkKey(link))),
  })

  return {
    failures: [
      ...checkFailures,
      ...addedBrokenLinks.map(
        (link) => `\`${link.file}\` links to \`${link.target}\`, which does not exist.`
      ),
    ],
    findings: assessment.findings,
    warnings: assessment.warnings,
  } satisfies Resolution.Remaining
})

export default Command.make("harden", { commits, json: Mode.json, scope }).pipe(
  Command.withDescription(
    "Ask a coding agent to find the project's coding standards and move each one up the enforcement ladder"
  ),
  Command.withHandler(({ commits, json, scope }) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      yield* Output.intro("💠 adamantite harden")

      const packageJson = yield* readPackageJson(cwd)

      // The Adamantite repository runs its own build, so it does not depend on itself.
      const isAdamantiteRepository = packageJson.name === "adamantite"

      if (
        !isAdamantiteRepository
        && !packageJson.devDependencies?.adamantite
        && !packageJson.dependencies?.adamantite
      ) {
        return yield* new AdamantiteNotInstalled({ command: "harden" })
      }

      // The prompt offers the presets and rules of this version, so the project must install it.
      const installedVersion = isAdamantiteRepository
        ? Option.fromUndefinedOr(packageJson.version)
        : yield* readInstalledVersion(cwd)

      if (Option.isNone(installedVersion)) {
        return yield* new AdamantiteNotInNodeModules({ command: "harden" })
      }

      if (installedVersion.value !== version) {
        return yield* new AdamantiteVersionMismatch({
          command: "harden",
          installed: installedVersion.value,
          running: version,
        })
      }

      // The current directory is a real path, so the scope must be one too. A scope through a
      // directory symlink, such as `/var` for `/private/var` on macOS, then stays inside the
      // project. The flag requires the folder to exist. Without it, the scope is the project.
      const scopeDirectory = Option.isSome(scope)
        ? yield* fs
            .realPath(path.resolve(cwd, scope.value))
            .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: scope.value })))
        : cwd

      const fromRoot = path.relative(cwd, scopeDirectory)

      if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
        return yield* new ScopeOutsideProject({ cwd, scope: scopeDirectory })
      }

      // Each step before the session takes this read of the workspace.
      const context = yield* readHardenContext(
        cwd,
        yield* Project.readWorkspace(),
        scopeDirectory,
        commits
      )

      const session = yield* Resolution.offer({
        command: "harden",
        document: Output.json(Report, { schemaVersion: 1, ...context }),
        message: "How do you want to harden this project?",
        prompt: renderHardenPrompt(context, version),
        subject: "the prompt",
        verify: verify(cwd, scopeDirectory, context.agentReach),
        work: Resolution.Task(),
      })

      yield* Output.outro(
        Option.isSome(session)
          ? "✅ Harden checks passed."
          : "Harden ended without an agent session."
      )
    }).pipe(Mode.provide({ json }))
  )
)
