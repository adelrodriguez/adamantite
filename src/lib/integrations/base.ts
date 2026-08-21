import type * as Effect from "effect/Effect"
import type { PackageJson } from "type-fest"

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

export interface Finding {
  readonly currentState: string
  readonly goal: readonly string[]
  readonly id: string
  readonly integration: string
  readonly notes?: readonly string[]
  readonly reference?: string
  readonly title: string
}

export type IntegrationAssessment =
  | {
      readonly applicable: false
      readonly warnings: readonly string[]
    }
  | {
      readonly applicable: true
      readonly findings: readonly Finding[]
      readonly packageActions: readonly PackageAction[]
      readonly warnings: readonly string[]
    }

export interface IntegrationBase<Kind extends IntegrationKind> {
  readonly config?: string
  readonly files?: readonly IntegrationFile[]
  readonly kind: Kind
  readonly name: string
}

export interface AssessableIntegration<Error = unknown, Requirements = unknown> {
  /**
   * Read-only diagnosis for the current project state.
   *
   * `assess` classifies package drift and managed state against the latest supported state. It must
   * not mutate files. The caller reads `package.json` once and shares the parsed manifest with
   * every assessment in the same pass.
   */
  readonly assess: (
    cwd: string,
    packageJson: PackageJson
  ) => Effect.Effect<IntegrationAssessment, Error, Requirements>
}

export function defineIntegration<const T extends IntegrationBase<IntegrationKind>>(
  integration: T
): T {
  return integration
}
