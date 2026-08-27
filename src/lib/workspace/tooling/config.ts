import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
  type IntegrationFile,
  type PackageAction,
  type ToolingPackage,
} from "#lib/integrations/base.ts"
import { readFile, writeFile } from "#lib/shared/filesystem.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
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

export type RequiredConfigInspection =
  | { readonly kind: "configured" }
  | { readonly kind: "invalid"; readonly reason: string }

function getConfigFormat(file: string): ToolingConfigFormat {
  if (file.endsWith(".jsonc")) {
    return "jsonc"
  }

  if (file.endsWith(".json")) {
    return "json"
  }

  return "ts"
}

function findLegacyConfigByFormat(files: ToolingConfigFiles, format: ToolingConfigFormat) {
  return Array.findFirst(files.legacyConfigs, (file) => getConfigFormat(file) === format)
}

function getLegacyConfigDisplayName(files: ToolingConfigFiles) {
  const jsonFile = findLegacyConfigByFormat(files, "json")
  const jsoncFile = findLegacyConfigByFormat(files, "jsonc")

  return pipe(
    Option.zipWith(jsonFile, jsoncFile, (json) => `${json}(c)`),
    Option.orElse(() => jsoncFile),
    Option.orElse(() => jsonFile),
    Option.getOrElse(() => "")
  )
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

  return pipe(
    Option.zipWith(
      findLegacyConfigByFormat(files, "json"),
      findLegacyConfigByFormat(files, "jsonc"),
      (jsonFile, jsoncFile) =>
        `Found both \`${jsonFile}\` and \`${jsoncFile}\`. Multiple legacy ${toolName} configs exist; Adamantite will treat \`${jsoncFile}\` as the source of truth in its findings.`
    ),
    Option.toArray
  )
}

/**
 * The single source of truth for a tooling integration's config state. Reads the filesystem once
 * and derives the active config, remaining legacy configs, and user-facing warnings; every other
 * layer (assess and init) builds on this state instead of re-deriving it.
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

  const active = pipe(
    Array.findFirst(present, (candidate) => candidate.format === "ts"),
    Option.orElse(() => Array.findFirst(present, (candidate) => candidate.format === "jsonc")),
    Option.orElse(() => Array.findFirst(present, (candidate) => candidate.format === "json")),
    Option.getOrNull
  )
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
): PackageAction[] {
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

export function getPackageFindings(
  actions: readonly PackageAction[],
  integration: string
): Finding[] {
  return actions.map((action) => ({
    currentState:
      action.type === "install_package"
        ? `The required package \`${action.package}\` is not installed.`
        : `The installed \`${action.package}\` version is \`${action.currentVersion}\`, but Adamantite requires \`${action.targetVersion}\`.`,
    goal: [
      `Run \`adamantite update\` so \`${action.package}@${action.targetVersion}\` is installed.`,
    ],
    id: `${action.type === "install_package" ? "missing" : "outdated"}-${action.package}`,
    integration,
    title:
      action.type === "install_package"
        ? `Missing ${action.package}`
        : `Outdated ${action.package}`,
  }))
}

export function getConfigFindings(
  state: ToolingConfigState,
  options: {
    readonly configContent: string
    readonly configFile: string
    readonly inspection?: RequiredConfigInspection
    readonly invalidGoal?: string
    readonly toolName: string
  }
): Finding[] {
  if (state.active === null) {
    return [
      {
        currentState: `The managed \`${options.configFile}\` file is missing.`,
        goal: [
          `Create \`${options.configFile}\` with the reference content.`,
          `Do not create a legacy JSON or JSONC ${options.toolName} config.`,
        ],
        id: `missing-${options.toolName}-config`,
        integration: options.toolName,
        reference: { content: options.configContent, language: "ts" },
        title: `Missing ${options.toolName} configuration`,
      },
    ]
  }

  if (state.active.format !== "ts") {
    return [
      {
        currentState: `Legacy \`${state.active.file}\` is the active ${options.toolName} configuration.`,
        goal: [
          `Port the project settings into \`${options.configFile}\` using the reference content as the base.`,
          `Delete every legacy ${options.toolName} JSON or JSONC config after its settings are preserved.`,
        ],
        id: `legacy-${options.toolName}-config`,
        integration: options.toolName,
        notes: [
          "Preserve project-specific settings. Do not replace them with the reference defaults.",
        ],
        reference: { content: options.configContent, language: "ts" },
        title: `Legacy ${options.toolName} configuration`,
      },
    ]
  }

  const findings: Finding[] = []

  if (state.legacy.length > 0) {
    findings.push({
      currentState: `Legacy ${options.toolName} config files remain next to \`${options.configFile}\`: ${state.legacy.map(({ file }) => `\`${file}\``).join(", ")}.`,
      goal: [
        `Delete the legacy files after you confirm that \`${options.configFile}\` preserves their project-specific settings.`,
      ],
      id: `shadowed-legacy-${options.toolName}-config`,
      integration: options.toolName,
      title: `Legacy ${options.toolName} files remain`,
    })
  }

  if (options.inspection?.kind === "invalid") {
    findings.push({
      currentState: `\`${options.configFile}\` does not meet Adamantite's required shape. ${options.inspection.reason}`,
      goal: [
        options.invalidGoal
          ?? `Update \`${options.configFile}\` so it includes the required Adamantite preset while preserving project-specific settings.`,
      ],
      id: `invalid-${options.toolName}-config`,
      integration: options.toolName,
      notes: ["Treat the reference as a known-good example, not an exact replacement."],
      reference: { content: options.configContent, language: "ts" },
      title: `Invalid ${options.toolName} configuration`,
    })
  }

  return findings
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
    assess: (_cwd: string, packageJson: PackageJson) =>
      Effect.sync(() => {
        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return {
            applicable: false,
            warnings: [],
          } satisfies IntegrationAssessment
        }

        const packageActions = getPackageActions(packageJson, options, options.purpose)

        return {
          applicable: true,
          findings: getPackageFindings(packageActions, options.name),
          packageActions,
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
  readonly inspectConfig: (content: string) => RequiredConfigInspection
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
    assess: (cwd: string, packageJson: PackageJson) =>
      Effect.gen(function* () {
        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return {
            applicable: false,
            warnings: [],
          } satisfies IntegrationAssessment
        }

        const state = yield* detect(cwd)
        const packageActions = getPackageActions(packageJson, options, options.purpose)
        const configContent = options.configContent()
        const inspection =
          state.active?.format === "ts"
            ? options.inspectConfig(yield* readFile(state.active.path))
            : undefined

        return {
          applicable: true,
          findings: [
            ...getPackageFindings(packageActions, options.name),
            ...getConfigFindings(state, {
              configContent,
              configFile: options.configFiles.config,
              inspection,
              toolName: options.name,
            }),
          ],
          packageActions,
          warnings: state.warnings,
        } satisfies IntegrationAssessment
      }),
    config: options.configFiles.config,
    create: (cwd: string) =>
      Effect.gen(function* () {
        const path = yield* Path.Path
        yield* writeFile(path.join(cwd, options.configFiles.config), options.configContent())
      }),
    detect,
    files,
    kind: "tooling",
    name: options.name,
    version: options.version,
  })
}
