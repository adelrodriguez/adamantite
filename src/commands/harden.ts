import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { BrokenLink } from "#lib/hardening/agent-reach.ts"
import { assessProject } from "#lib/assessment/index.ts"
import * as Bridge from "#lib/bridge/index.ts"
import { DecisionsRecord, readDecisionsRecord } from "#lib/hardening/decisions-record.ts"
import {
  DEFAULT_FIX_HISTORY_COMMITS,
  HardenContext,
  readHardenContext,
  readHardenReach,
  renderHardenPrompt,
} from "#lib/hardening/index.ts"
import { readInstalledVersion } from "#lib/project/adamantite-version.ts"
import * as Project from "#lib/project/index.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import {
  AdamantiteNotInNodeModules,
  AdamantiteNotInstalled,
  AdamantiteVersionMismatch,
  FailedToReadFile,
  ScopeOutsideProject,
} from "#lib/shared/errors.ts"
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
  Flag.optional,
  Flag.withDescription(
    `Read the last <commits> commits to find past fixes. A session with this flag does not move the start of later sessions. By default, the agent reads the commits since the last session that the decisions record has for the scope, or the last ${DEFAULT_FIX_HISTORY_COMMITS} commits`
  )
)

/**
 * The lines of the decisions record that do not decode. A project without a record has none.
 */
function listUndecodableLines(record: DecisionsRecord) {
  return DecisionsRecord.match(record, {
    Missing: () => [],
    Present: ({ undecodableLines }) => undecodableLines,
  })
}

/**
 * What remains after a harden session. The agent verifies custom rules during the session with
 * temporary cases, which it removes before it hands back, and the project must still pass check and
 * Doctor after it. A link that was broken before the session is a gap that the user may not have
 * approved, so only a link that the session added remains. The same holds for a line of the
 * decisions record that does not decode: only a line that the session added remains. `before` is
 * the context that the session started from.
 */
const verify = Effect.fn("verify")(function* (cwd: string, scope: string, before: HardenContext) {
  const CHECK_FAILED = "`adamantite check` failed."

  // A failed command already printed why it failed. Any other failure, such as a missing tool,
  // printed nothing about itself, so its message joins the failures.
  const checkFailures = yield* Bridge.check().pipe(
    Effect.as([]),
    Effect.catchTag("CommandFailed", () => Effect.succeed([CHECK_FAILED])),
    Effect.catch((error) => Effect.succeed([error.message, CHECK_FAILED]))
  )

  // The session can change the project, so agent reach and assessment share a new read.
  const project = yield* Project.read()

  const [reachAfter, assessment, recordAfter] = yield* Effect.all(
    [
      readHardenReach(cwd, project.workspace, scope),
      assessProject(project),
      readDecisionsRecord(cwd, before.scope),
    ],
    { concurrency: "unbounded" }
  )

  const brokenBefore = new Set(
    Option.match(before.agentReach, {
      onNone: () => [],
      onSome: (reach) => reach.brokenLinks.map((link) => getLinkKey(link)),
    })
  )

  const addedBrokenLinks = Option.match(reachAfter, {
    onNone: () => [],
    onSome: (reach) => reach.brokenLinks.filter((link) => !brokenBefore.has(getLinkKey(link))),
  })

  // A line has no key that survives a repair, so its text tells whether the session added it.
  const undecodableBefore = new Set(
    listUndecodableLines(before.decisionsRecord).map(({ text }) => text)
  )

  return {
    failures: [
      ...checkFailures,
      ...addedBrokenLinks.map(
        (link) => `\`${link.file}\` links to \`${link.target}\`, which does not exist.`
      ),
      ...listUndecodableLines(recordAfter)
        .filter(({ text }) => !undecodableBefore.has(text))
        .map(
          ({ issue, line }) => `Line ${line} of \`${recordAfter.path}\` does not decode: ${issue}`
        ),
    ],
    findings: assessment.findings,
    warnings: assessment.warnings,
  } satisfies Resolution.Remaining
})

/**
 * Renders the prompt that tells a coding agent to move the project's coding standards up the
 * enforcement ladder, and offers it through `Resolution.offer` as a `Task`. The prompt shows what
 * `src/lib/hardening` computes as data: each Markdown file that git lists outside the skill
 * folders, the discovery gaps, the disable comments of each rule, each file of an override that
 * turns a rule off, and the decisions of the decisions record. The functions of `src/lib/hardening`
 * take the `Workspace` as a parameter and do not read it, so the command reads it one time before
 * the session. Harden produces no findings, so it never changes Doctor's result.
 */
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
        prompt: renderHardenPrompt(
          context,
          version,
          DateTime.formatIsoDate(yield* DateTime.nowInCurrentZone)
        ),
        subject: "the prompt",
        verify: verify(cwd, scopeDirectory, context),
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
