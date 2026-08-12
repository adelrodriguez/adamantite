import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import {
  defineIntegration,
  type AssessmentAction,
  type IntegrationAssessment,
  type IntegrationFile,
  type ToolingPackage,
} from "#lib/integrations/base.ts"
import { FailedToWriteFile } from "#lib/shared/errors.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
  type Script,
} from "#lib/workspace/package-json.ts"

export type ToolingConfigFormat = "ts" | "json" | "jsonc"

export interface ToolingConfigFileState {
  /**
   * Path relative to the target project root, e.g. `knip.json`.
   */
  readonly file: string
  readonly format: ToolingConfigFormat
  /**
   * Absolute path.
   */
  readonly path: string
}

export interface ToolingConfigState {
  readonly active: ToolingConfigFileState | null
  readonly legacy: readonly ToolingConfigFileState[]
  readonly warnings: readonly string[]
}

export interface ToolingConfigFiles {
  /**
   * The latest supported config file, e.g. `knip.config.ts`.
   */
  readonly config: string
  /**
   * Legacy config files. When several exist, `jsonc` wins over `json` as the active one.
   */
  readonly legacyConfigs: readonly string[]
}

function getConfigFormat(file: string): ToolingConfigFormat {
  if (file.endsWith(".jsonc")) {
    return "jsonc"
  }

  if (file.endsWith(".json")) {
    return "json"
  }

  return "ts"
}

function getLegacyConfigDisplayName(files: ToolingConfigFiles) {
  const jsonFile = files.legacyConfigs.find((file) => getConfigFormat(file) === "json")
  const jsoncFile = files.legacyConfigs.find((file) => getConfigFormat(file) === "jsonc")

  if (jsonFile && jsoncFile) {
    return `${jsonFile}(c)`
  }

  return jsoncFile ?? jsonFile ?? ""
}

function getToolingConfigWarnings(
  toolName: string,
  files: ToolingConfigFiles,
  active: ToolingConfigFileState | null,
  legacy: readonly ToolingConfigFileState[]
) {
  if (active === null || legacy.length === 0) {
    return []
  }

  if (active.format === "ts") {
    return [
      `Found both \`${files.config}\` and \`${getLegacyConfigDisplayName(files)}\`. Adamantite will use \`${files.config}\`.`,
    ]
  }

  const jsonFile = files.legacyConfigs.find((file) => getConfigFormat(file) === "json")
  const jsoncFile = files.legacyConfigs.find((file) => getConfigFormat(file) === "jsonc")

  if (!jsonFile || !jsoncFile) {
    return []
  }

  return [
    `Found both \`${jsonFile}\` and \`${jsoncFile}\`. Multiple legacy ${toolName} configs exist; Adamantite will treat \`${jsoncFile}\` as the source of truth when migration is needed.`,
  ]
}

/**
 * The single source of truth for a tooling integration's config state. Reads the filesystem once
 * and derives the active config, remaining legacy configs, and user-facing warnings; every other
 * layer (assess, migrations, init) builds on this state instead of re-deriving it.
 */
export const detectToolingConfig = Effect.fn("detectToolingConfig")(function* (
  cwd: string,
  toolName: string,
  files: ToolingConfigFiles
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const candidates = [files.config, ...files.legacyConfigs].map((file) => ({
    file,
    format: getConfigFormat(file),
    path: path.join(cwd, file),
  }))
  const existence = yield* Effect.forEach(candidates, (candidate) => fs.exists(candidate.path), {
    concurrency: "unbounded",
  })
  const present = candidates.filter((_, index) => existence[index])

  const active =
    present.find((candidate) => candidate.format === "ts") ??
    present.find((candidate) => candidate.format === "jsonc") ??
    present.find((candidate) => candidate.format === "json") ??
    null
  const legacy = present.filter((candidate) => candidate !== active && candidate.format !== "ts")

  return {
    active,
    legacy,
    warnings: getToolingConfigWarnings(toolName, files, active, legacy),
  } satisfies ToolingConfigState
})

/**
 * Classify package drift for a managed tooling package: missing install or version mismatch.
 */
export function getPackageActions(
  packageJson: PackageJson,
  pkg: ToolingPackage,
  purpose: string
): AssessmentAction[] {
  const specifier = packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

  if (!specifier) {
    return [
      {
        description: `Install \`${pkg.name}@${pkg.version}\` for ${purpose}.`,
        package: pkg.name,
        targetVersion: pkg.version,
        type: "install_package",
      },
    ]
  }

  if (normalizeDependencyVersion(specifier) !== pkg.version) {
    return [
      {
        currentVersion: specifier,
        description: `Update \`${pkg.name}\` from \`${specifier}\` to \`${pkg.version}\`.`,
        package: pkg.name,
        targetVersion: pkg.version,
        type: "update_package",
      },
    ]
  }

  return []
}

/**
 * Classify config drift from a detected config state: missing config or a pending legacy migration.
 */
export function getConfigActions(
  state: ToolingConfigState,
  options: {
    readonly configFile: string
    readonly migrationId: string
    readonly toolName: string
  }
): AssessmentAction[] {
  if (state.active === null) {
    return [
      {
        description: `Create \`${options.configFile}\` for \`${options.toolName}\`.`,
        path: options.configFile,
        type: "create_config",
      },
    ]
  }

  if (state.active.format !== "ts") {
    return [
      {
        description: `Migrate legacy \`${state.active.file}\` to \`${options.configFile}\`.`,
        migrationId: options.migrationId,
        type: "run_migration",
      },
    ]
  }

  return []
}

function checkHasManagedScript(packageJson: PackageJson, scripts: readonly Script[]) {
  const managedScripts = getManagedScripts(packageJson)

  return scripts.some((script) => managedScripts.includes(script))
}

/**
 * A tooling integration that only manages a package version, with no config file (Sherif,
 * Tsgolint).
 */
export function definePackageTooling(options: {
  readonly name: string
  readonly purpose: string
  readonly scripts: readonly Script[]
  readonly version: string
}) {
  return defineIntegration({
    assess: (cwd: string) =>
      Effect.gen(function* () {
        const packageJson = yield* readPackageJson(cwd)

        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return {
            applicable: false,
            warnings: [],
          } satisfies IntegrationAssessment
        }

        return {
          actions: getPackageActions(packageJson, options, options.purpose),
          applicable: true,
          warnings: [],
        } satisfies IntegrationAssessment
      }),
    kind: "tooling",
    name: options.name,
    version: options.version,
  })
}

/**
 * A tooling integration that manages a package version and a TypeScript config file with legacy
 * JSON predecessors (Knip, Oxfmt).
 */
export function defineConfigTooling(options: {
  readonly configContent: () => string
  readonly configFiles: ToolingConfigFiles
  readonly migrationId: string
  readonly name: string
  readonly purpose: string
  readonly scripts: readonly Script[]
  readonly version: string
}) {
  const files: readonly IntegrationFile[] = [
    { path: options.configFiles.config, type: "config" },
    ...options.configFiles.legacyConfigs.map(
      (path) => ({ path, type: "legacy_config" }) satisfies IntegrationFile
    ),
  ]
  const detect = (cwd: string) => detectToolingConfig(cwd, options.name, options.configFiles)

  return defineIntegration({
    assess: (cwd: string) =>
      Effect.gen(function* () {
        const packageJson = yield* readPackageJson(cwd)

        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return {
            applicable: false,
            warnings: [],
          } satisfies IntegrationAssessment
        }

        const state = yield* detect(cwd)

        return {
          actions: [
            ...getPackageActions(packageJson, options, options.purpose),
            ...getConfigActions(state, {
              configFile: options.configFiles.config,
              migrationId: options.migrationId,
              toolName: options.name,
            }),
          ],
          applicable: true,
          warnings: state.warnings,
        } satisfies IntegrationAssessment
      }),
    config: options.configFiles.config,
    create: (cwd: string) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const configPath = path.join(cwd, options.configFiles.config)

        yield* fs
          .writeFileString(configPath, options.configContent())
          .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
      }),
    detect,
    files,
    kind: "tooling",
    name: options.name,
    version: options.version,
  })
}
