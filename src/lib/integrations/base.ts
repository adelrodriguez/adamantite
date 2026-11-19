import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Project from "#lib/project/index.ts"
import type { Selection } from "#lib/project/selection.ts"

export interface ToolingPackage {
  readonly name: string
  readonly version: string
}

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

export interface ManagedFile {
  readonly content: string
  readonly path: string
}

export interface Integration<E = unknown, R = unknown> {
  readonly assess: (
    project: Project.Snapshot,
    selection: Selection
  ) => Effect.Effect<AssessmentPart, E, R>
  readonly files: (
    project: Project.Snapshot,
    selection: Selection
  ) => Effect.Effect<readonly ManagedFile[], E, R>
  readonly name: string
  readonly packages: (project: Project.Snapshot, selection: Selection) => readonly ToolingPackage[]
  readonly prepare?: (project: Project.Snapshot) => Effect.Effect<void, E, R>
  readonly selected: (selection: Selection) => boolean
}
