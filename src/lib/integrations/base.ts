import type * as Effect from "effect/Effect"

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
      readonly migrationId: string
      readonly type: "run_migration"
    }

interface IntegrationAssessment {
  readonly actions: readonly AssessmentAction[]
  readonly status: "not_applicable" | "healthy" | "needs_action"
  readonly warnings: readonly string[]
}

interface Integration {
  readonly assess?: (
    ...args: readonly never[]
  ) => Effect.Effect<IntegrationAssessment, unknown, unknown>
  readonly config?: string
  readonly files?: readonly IntegrationFile[]
  readonly kind: IntegrationKind
  readonly name: string
}

export function defineIntegration<const T extends Integration>(integration: T): T {
  return integration
}
