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

export interface CreatableIntegration<
  Parameters extends readonly unknown[] = [],
  Error = unknown,
  Requirements = unknown,
> {
  /**
   * Write the latest supported config from scratch. Used to satisfy `create_config` assessment
   * actions.
   */
  readonly create: (
    cwd: string,
    ...parameters: Parameters
  ) => Effect.Effect<void, Error, Requirements>
}

export interface DetectableIntegration<State, Error = unknown, Requirements = unknown> {
  /**
   * Inspect whether the integration is present and, when applicable, which config is active.
   */
  readonly detect: (cwd: string) => Effect.Effect<State, Error, Requirements>
}

export interface UpdatableIntegration<
  Parameters extends readonly unknown[] = [],
  Error = unknown,
  Requirements = unknown,
> {
  /**
   * Safely rewrite an existing latest-format config into the latest supported shape. Used to
   * satisfy `update_config` assessment actions.
   */
  readonly update: (
    cwd: string,
    ...parameters: Parameters
  ) => Effect.Effect<void, Error, Requirements>
}

export type ToolingIntegration<
  Error = unknown,
  Requirements = unknown,
> = IntegrationBase<"tooling"> & ToolingPackage & AssessableIntegration<Error, Requirements>

export type EditorIntegration<
  DetectError = unknown,
  DetectRequirements = unknown,
  CreateError = unknown,
  CreateRequirements = unknown,
  UpdateError = unknown,
  UpdateRequirements = unknown,
> = IntegrationBase<"editor"> &
  DetectableIntegration<boolean, DetectError, DetectRequirements> &
  CreatableIntegration<[], CreateError, CreateRequirements> &
  UpdatableIntegration<[], UpdateError, UpdateRequirements>

export type WorkspaceIntegration<
  DetectError = unknown,
  DetectRequirements = unknown,
  CreateError = unknown,
  CreateRequirements = unknown,
  UpdateError = unknown,
  UpdateRequirements = unknown,
> = IntegrationBase<"workspace"> &
  DetectableIntegration<boolean, DetectError, DetectRequirements> &
  CreatableIntegration<[], CreateError, CreateRequirements> &
  UpdatableIntegration<[], UpdateError, UpdateRequirements>

export type CIIntegration<
  CreateParameters extends readonly unknown[] = readonly never[],
  UpdateParameters extends readonly unknown[] = readonly never[],
  DetectError = unknown,
  DetectRequirements = unknown,
  CreateError = unknown,
  CreateRequirements = unknown,
  UpdateError = unknown,
  UpdateRequirements = unknown,
> = IntegrationBase<"ci"> &
  DetectableIntegration<boolean, DetectError, DetectRequirements> &
  CreatableIntegration<CreateParameters, CreateError, CreateRequirements> &
  UpdatableIntegration<UpdateParameters, UpdateError, UpdateRequirements>

export type Integration =
  | ToolingIntegration
  | EditorIntegration
  | WorkspaceIntegration
  | CIIntegration

type ValidateOperation<T, Key extends PropertyKey, Success> = Key extends keyof T
  ? T[Key] extends (...parameters: never[]) => Effect.Effect<infer Actual, unknown, unknown>
    ? Parameters<T[Key]> extends [cwd: string, ...parameters: unknown[]]
      ? Actual extends Success
        ? true
        : false
      : false
    : false
  : false

type IntegrationContract<T extends IntegrationBase<IntegrationKind>> = T["kind"] extends "tooling"
  ? T extends ToolingPackage
    ? ValidateOperation<T, "assess", IntegrationAssessment>
    : false
  : T["kind"] extends "editor" | "workspace"
    ? ValidateOperation<T, "detect", boolean> extends true
      ? ValidateOperation<T, "create", void> extends true
        ? ValidateOperation<T, "update", void>
        : false
      : false
    : T["kind"] extends "ci"
      ? ValidateOperation<T, "detect", boolean> extends true
        ? ValidateOperation<T, "create", void> extends true
          ? ValidateOperation<T, "update", void>
          : false
        : false
      : false

export function defineIntegration<const T extends IntegrationBase<IntegrationKind>>(
  integration: T,
  ...validation: IntegrationContract<T> extends true ? [] : [invalidIntegration: never]
): T {
  void validation
  return integration
}
