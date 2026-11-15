import type * as Effect from "effect/Effect"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"

export type IntegrationKind = "tooling" | "workspace" | "editor" | "ci"

export type IntegrationFileType = "config" | "legacy_config" | "ci"

export interface IntegrationFile {
  readonly path: string
  readonly type: IntegrationFileType
}

export interface ToolingPackage {
  readonly name: string
  readonly version: string
}

export type PackageAction =
  | {
      readonly description: string
      readonly package: string
      readonly targetVersion: string
      readonly type: "install_package"
    }
  | {
      readonly currentVersion: string
      readonly description: string
      readonly package: string
      readonly targetVersion: string
      readonly type: "update_package"
    }

export interface FindingReference {
  readonly content: string
  readonly language: "json" | "ts"
}

export interface Finding {
  readonly currentState: string
  readonly goal: readonly string[]
  readonly id: string
  readonly integration: string
  readonly notes?: readonly string[]
  readonly reference?: FindingReference
  readonly title: string
}

/**
 * What the assessment of one selected integration found.
 */
export interface AssessmentPart {
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
 * list in `integrations/index.ts`, so an integration is one folder and one line there. `E` and `R`
 * are the errors and the services of its effects.
 */
export interface Integration<E = unknown, R = unknown> {
  /**
   * Reads the project, its configs included, and returns findings. It never writes. A file that the
   * user changed gets a finding only when the change breaks the setup.
   */
  readonly assess: (project: Project, selection: Selection) => Effect.Effect<AssessmentPart, E, R>
  /**
   * The files that Adamantite renders whole for the selection.
   */
  readonly files: (
    project: Project,
    selection: Selection
  ) => Effect.Effect<readonly ManagedFile[], E, R>
  readonly name: string
  /**
   * The packages to install, at the managed versions.
   */
  readonly packages: (selection: Selection) => readonly ToolingPackage[]
  /**
   * Builds what the integration needs outside the files that the project commits, after the
   * install, such as the Effect editor SDK in `node_modules`. A failure that `assess` reports as a
   * finding does not fail the setup. `Effect.void` when the integration needs nothing.
   */
  readonly prepare: (project: Project) => Effect.Effect<void, E, R>
  /**
   * Whether the selection includes this integration.
   */
  readonly selected: (selection: Selection) => boolean
}

export interface IntegrationBase<Kind extends IntegrationKind> {
  readonly config?: string
  readonly files?: readonly IntegrationFile[]
  readonly kind: Kind
  readonly name: string
}

export function defineIntegration<const T extends IntegrationBase<IntegrationKind>>(
  integration: T
): T {
  return integration
}
