import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { Selection } from "#lib/project/selection.ts"
import {
  assessProject,
  ProjectAssessment,
  renderAssessmentMarkdown,
} from "#lib/assessment/index.ts"
import * as Project from "#lib/project/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import * as Setup from "#lib/setup/index.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Output from "#terminal/output.ts"
import * as Resolution from "#terminal/resolution.ts"
import { printFileWrites, printInstalls, printScriptWrites } from "#terminal/setup.ts"

const version = getPackageVersion()

/**
 * What `init --json` and `update --json` print: what Setup did, or null when it did not run, and
 * the assessment of the project that it left.
 */
export const Report = Schema.Struct({
  assessment: ProjectAssessment,
  schemaVersion: Schema.Literal(1),
  setup: Schema.NullOr(Setup.Result),
})

/**
 * Assesses the project at `cwd` after `setup`, and offers the repair of its findings through
 * `Resolution.offer`. The command fails while findings remain.
 */
export const offerRepair = Effect.fn("offerRepair")(function* (
  command: "init" | "update",
  cwd: string,
  setup: Setup.Result | null
) {
  // The lockfile decides which integrations apply, so each assessment reads the project again.
  const assess = Project.read().pipe(Effect.flatMap(assessProject))
  const assessment = yield* assess

  yield* Resolution.offer({
    command,
    cwd,
    document: Output.json(Report, { assessment, schemaVersion: 1, setup }),
    message: "How do you want to resolve these findings?",
    prompt: renderAssessmentMarkdown(assessment, version),
    subject: "findings",
    verify: Effect.map(assess, Resolution.fromAssessment),
    work: Resolution.Repair({ remaining: Resolution.fromAssessment(assessment) }),
  })
})

/**
 * The backend that `init` and `update` share once each has its selection: `Setup.apply`, then the
 * repair of the findings that remain in the project that it left. It prints what Setup did. It
 * returns whether Setup changed the project.
 */
export const applySetup = Effect.fn("applySetup")(function* (
  command: "init" | "update",
  project: Project.Snapshot,
  selection: Selection
) {
  const setup = yield* Setup.apply(project, selection)

  yield* printInstalls(setup.installs)
  yield* printScriptWrites(setup.scripts)
  yield* printFileWrites(setup.files)

  yield* setup.lockfile === "unchanged"
    ? Output.info(`\`${LOCKFILE_PATH}\` already records this setup.`)
    : Output.success(
        Option.isNone(project.lockfile)
          ? `\`${LOCKFILE_PATH}\` written. Commit it with the setup.`
          : `\`${LOCKFILE_PATH}\` updated. Commit it.`
      )

  yield* offerRepair(command, yield* Project.Directory, setup)

  return (
    setup.installs.length > 0
    || setup.lockfile === "written"
    || setup.scripts.some(({ _tag }) => _tag !== "Unchanged")
    || setup.files.some(({ _tag }) => _tag !== "Kept" && _tag !== "Unchanged")
  )
})
