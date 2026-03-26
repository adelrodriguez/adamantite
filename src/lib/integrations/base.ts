type IntegrationKind = "tooling" | "workspace" | "editor" | "ci"

type IntegrationFileType = "config" | "legacy_config" | "ci"

interface IntegrationFile {
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

interface Integration {
  /**
   * Read-only diagnosis for the current project state.
   *
   * `assess` may classify package drift, missing config, supported config updates,
   * manual follow-up work, and known migrations. It must not mutate files or call migrations.
   */
  readonly assess?: unknown

  /**
   * Write the latest supported config from scratch.
   * Used to satisfy `create_config` assessment actions.
   */
  readonly create?: unknown

  readonly config?: string

  /**
   * Check whether the latest supported config is present and active.
   */
  readonly exists?: unknown
  readonly files?: readonly IntegrationFile[]
  readonly kind: IntegrationKind
  readonly name: string

  /**
   * Safely rewrite an existing latest-format config into the latest supported shape.
   * Used to satisfy `update_config` assessment actions.
   */
  readonly update?: unknown
}

export function defineIntegration<const T extends Integration>(integration: T): T {
  return integration
}
