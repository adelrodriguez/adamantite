import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Project from "#lib/project/index.ts"
import type { Selection } from "#lib/project/selection.ts"

export interface ToolingPackage {
  readonly name: string
  readonly version: string
}

/**
 * A managed package that the project does not declare at the managed version. `update` installs it,
 * and `doctor --json` prints it.
 */
export const PackageAction = Schema.Union([
  Schema.Struct({
    description: Schema.String,
    package: Schema.String,
    targetVersion: Schema.String,
    type: Schema.Literal("install_package"),
  }),
  Schema.Struct({
    currentVersion: Schema.String,
    description: Schema.String,
    package: Schema.String,
    targetVersion: Schema.String,
    type: Schema.Literal("update_package"),
  }),
])

export type PackageAction = typeof PackageAction.Type

const FindingReference = Schema.Struct({
  content: Schema.String,
  language: Schema.Literals(["json", "ts"]),
})

/**
 * A difference between the current state and the latest supported state. `doctor --json` prints
 * each one as this schema encodes it.
 */
export const Finding = Schema.Struct({
  currentState: Schema.String,
  goal: Schema.Array(Schema.String),
  id: Schema.String,
  integration: Schema.String,
  notes: Schema.optionalKey(Schema.Array(Schema.String)),
  reference: Schema.optionalKey(FindingReference),
  title: Schema.String,
})

export type Finding = typeof Finding.Type

/**
 * What the assessment of one selected integration found.
 */
interface AssessmentPart {
  readonly findings: readonly Finding[]
  readonly packageActions: readonly PackageAction[]
  readonly warnings: readonly string[]
}

export type IntegrationAssessment =
  | {
      readonly applicable: false
    }
  | ({
      readonly applicable: true
    } & AssessmentPart)

/**
 * A file that Adamantite renders whole. `Setup.apply` writes it under the write rule: only when the
 * file does not exist, or when its hash equals the hash that the lockfile recorded.
 */
export interface ManagedFile {
  /**
   * The content that this Adamantite version writes, already in the layout that Oxfmt gives it.
   */
  readonly content: string
  /**
   * The path from the project root, with `/` separators.
   */
  readonly path: string
}

/**
 * Everything Adamantite knows about one integration. `Setup.apply` and the assessment iterate the
 * list in `integrations/index.ts`, so an integration is one folder and one line there. A command
 * builder is not a member: the `command.ts` of a tool returns `CommandRunOptions` and starts no
 * process, and the bridge and `Setup.apply` import it. `E` and `R` are the errors and the services
 * of its effects.
 */
export interface Integration<E = unknown, R = unknown> {
  /**
   * Reads the project, its configs included, and returns findings. It never writes. A file that the
   * user changed gets a finding only when the change breaks the setup.
   */
  readonly assess: (
    project: Project.Snapshot,
    selection: Selection
  ) => Effect.Effect<AssessmentPart, E, R>
  /**
   * The files that Adamantite renders whole for the selection.
   */
  readonly files: (
    project: Project.Snapshot,
    selection: Selection
  ) => Effect.Effect<readonly ManagedFile[], E, R>
  readonly name: string
  /**
   * The packages to install, at the managed versions. The project decides some, such as Sherif,
   * which only a monorepo needs.
   */
  readonly packages: (project: Project.Snapshot, selection: Selection) => readonly ToolingPackage[]
  /**
   * Builds what the integration needs outside the files that the project commits, after the
   * install, such as the Effect editor SDK in `node_modules`. A failure that `assess` reports as a
   * finding does not fail the setup. An integration that needs nothing has none.
   */
  readonly prepare?: (project: Project.Snapshot) => Effect.Effect<void, E, R>
  /**
   * Whether the selection includes this integration, such as `oxlint` for a selection with the
   * `check` or the `fix` script.
   */
  readonly selected: (selection: Selection) => boolean
}
