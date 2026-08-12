import type * as Effect from "effect/Effect"

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

export type AssessmentAction =
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
  | {
      readonly description: string
      readonly path: string
      readonly type: "create_config" | "update_config"
    }
  | {
      readonly description: string
      readonly path?: string
      readonly type: "manual_fix"
    }
  | {
      readonly description: string
      readonly migrationId: string
      readonly type: "run_migration"
    }

export type IntegrationAssessment =
  | {
      readonly applicable: false
      readonly warnings: readonly string[]
    }
  | {
      readonly actions: readonly AssessmentAction[]
      readonly applicable: true
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
   * `assess` may classify package drift, missing config, supported config updates, manual follow-up
   * work, and known migrations. It must not mutate files or call migrations.
   */
  readonly assess: (cwd: string) => Effect.Effect<IntegrationAssessment, Error, Requirements>
}

export function defineIntegration<const T extends IntegrationBase<IntegrationKind>>(
  integration: T
): T {
  return integration
}
