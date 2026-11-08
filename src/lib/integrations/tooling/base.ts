import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Project } from "#lib/workspace/project.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
  type IntegrationFile,
  type PackageAction,
  type ToolingPackage,
} from "#lib/integrations/base.ts"
import { readFile, readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
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
  /**
   * Absolute path.
   */
  readonly path: string
}

/**
 * The config that the tool uses: none, the latest supported TypeScript config, or a legacy JSON or
 * JSONC config.
 */
export type ActiveToolingConfig =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Current"; readonly file: ToolingConfigFileState }
  | { readonly _tag: "Legacy"; readonly file: ToolingConfigFileState }

export interface ToolingConfigState {
  readonly active: ActiveToolingConfig
  /**
   * The legacy configs that the tool does not use.
   */
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
  | {
      /**
       * The repair to make. Defaults to adding the required preset.
       */
      readonly goal?: string
      readonly kind: "invalid"
      readonly reason: string
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
  active: ActiveToolingConfig,
  legacy: readonly ToolingConfigFileState[]
) {
  if (active._tag === "Missing" || legacy.length === 0) {
    return []
  }

  if (active._tag === "Current") {
    return [
      `Found both \`${files.config}\` and \`${getLegacyConfigDisplayName(files)}\`. Adamantite will use \`${files.config}\`.`,
    ]
  }

  return pipe(
    Option.zipWith(
      findLegacyConfigByFormat(files, "json"),
      findLegacyConfigByFormat(files, "jsonc"),
      (jsonFile, jsoncFile) =>
        `Found both \`${jsonFile}\` and \`${jsoncFile}\`. Multiple legacy ${toolName} configs exist. Doctor uses \`${jsoncFile}\` when checking the setup.`
    ),
    Option.toArray
  )
}

/**
 * Reads the filesystem one time and derives the active config, the remaining legacy configs, and
 * the warnings. Assess and init use this state and do not derive it again.
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

  const toFile = ({ file, path }: (typeof candidates)[number]): ToolingConfigFileState => ({
    file,
    path,
  })

  const activeCandidate = pipe(
    Array.findFirst(present, (candidate) => candidate.format === "ts"),
    Option.orElse(() => Array.findFirst(present, (candidate) => candidate.format === "jsonc")),
    Option.orElse(() => Array.findFirst(present, (candidate) => candidate.format === "json"))
  )

  const active = Option.match(activeCandidate, {
    onNone: (): ActiveToolingConfig => ({ _tag: "Missing" }),
    onSome: (candidate): ActiveToolingConfig => ({
      _tag: candidate.format === "ts" ? "Current" : "Legacy",
      file: toFile(candidate),
    }),
  })

  const legacy = present.flatMap((candidate) =>
    candidate.format !== "ts" && !Option.exists(activeCandidate, (file) => file === candidate)
      ? [toFile(candidate)]
      : []
  )

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
    /**
     * The inspection of a `Current` config. The findings ignore it for the other states.
     */
    readonly inspection?: RequiredConfigInspection
    readonly invalidGoal?: string
    readonly toolName: string
  }
): Finding[] {
  if (state.active._tag === "Missing") {
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

  if (state.active._tag === "Legacy") {
    return [
      {
        currentState: `Legacy \`${state.active.file.file}\` is the active ${options.toolName} configuration.`,
        goal: [
          `Move the project settings into \`${options.configFile}\` using the reference content as the base.`,
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
          ?? options.inspection.goal
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
 * A tooling integration that only manages a package version, with no config file (Sherif and
 * Tsgolint). Oxlint's managed plugins build on it through `defineManagedPlugin`.
 */
export function definePackageTooling(options: {
  /**
   * Findings for retired managed scripts or packages. While any exist, the integration stays
   * applicable and reports them so the scripts get removed.
   */
  readonly legacyFindings?: (packageJson: PackageJson) => readonly Finding[]
  /**
   * An extra condition for requiring the package, checked after the managed scripts.
   */
  readonly isRequired?: (project: Project) => boolean
  /**
   * Whether the package is required only in a detected monorepo.
   */
  readonly monorepoOnly?: boolean
  readonly name: string
  readonly purpose: string
  readonly scripts: readonly Script[]
  readonly version: string
}) {
  return defineIntegration({
    assess: (project: Project) =>
      Effect.sync((): IntegrationAssessment => {
        const { packageJson } = project

        const isApplicable =
          checkHasManagedScript(packageJson, options.scripts)
          && (!options.monorepoOnly || project.workspace.isMonorepo)
          && (options.isRequired === undefined || options.isRequired(project))

        const legacyFindings = options.legacyFindings?.(packageJson) ?? []

        if (!isApplicable) {
          return legacyFindings.length > 0
            ? { applicable: true, findings: [...legacyFindings], packageActions: [], warnings: [] }
            : { applicable: false }
        }

        const packageActions = getPackageActions(packageJson, options, options.purpose)

        return {
          applicable: true,
          findings: [...getPackageFindings(packageActions, options.name), ...legacyFindings],
          packageActions,
          warnings: [],
        }
      }),
    kind: "tooling",
    name: options.name,
    version: options.version,
  })
}

/**
 * The target-project facts that a managed config file depends on.
 */
export interface ToolingWorkspace {
  readonly isMonorepo: boolean
}

/**
 * The project facts that a tooling integration derives its workspace from. An assessment takes them
 * from the project, and `init` reads them when it creates a config.
 */
export interface ToolingFacts {
  readonly isMonorepo: boolean
  /**
   * The content of the root `oxlint.config.ts`, or none when it does not exist.
   */
  readonly lintConfig: Option.Option<string>
}

const readToolingFacts = Effect.fn("readToolingFacts")(function* (cwd: string) {
  const path = yield* Path.Path

  const [isMonorepo, lintConfig] = yield* Effect.all(
    [checkIsMonorepo(cwd), readFileIfExists(path.join(cwd, "oxlint.config.ts"))],
    { concurrency: "unbounded" }
  )

  return { isMonorepo, lintConfig } satisfies ToolingFacts
})

/**
 * A tooling integration that manages a package version and a TypeScript config file with legacy
 * JSON predecessors (Knip, Oxfmt).
 */
export function defineConfigTooling<Workspace extends ToolingWorkspace>(options: {
  /**
   * The config file content `init` writes and doctor findings reference. It can depend on the
   * workspace.
   */
  readonly configContent: (workspace: Workspace) => string
  readonly configFiles: ToolingConfigFiles
  readonly inspectConfig: (content: string, workspace: Workspace) => RequiredConfigInspection
  /**
   * Findings for retired managed scripts or packages. While any exist, the integration stays
   * applicable and reports them so the scripts get removed.
   */
  readonly legacyFindings?: (packageJson: PackageJson) => readonly Finding[]
  readonly name: string
  readonly purpose: string
  readonly scripts: readonly Script[]
  readonly version: string
  /**
   * Derive the workspace for `configContent` and `inspectConfig` from the project facts.
   */
  readonly workspace: (facts: ToolingFacts) => Workspace
}) {
  const files: readonly IntegrationFile[] = [
    { path: options.configFiles.config, type: "config" },
    ...options.configFiles.legacyConfigs.map(
      (path) => ({ path, type: "legacy_config" }) satisfies IntegrationFile
    ),
  ]

  const detect = (cwd: string) => detectToolingConfig(cwd, options.name, options.configFiles)

  return defineIntegration({
    assess: ({ cwd, lintConfig, packageJson, workspace: { isMonorepo } }: Project) =>
      Effect.gen(function* () {
        const legacyFindings = options.legacyFindings?.(packageJson) ?? []

        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return legacyFindings.length > 0
            ? ({
                applicable: true,
                findings: legacyFindings,
                packageActions: [],
                warnings: [],
              } satisfies IntegrationAssessment)
            : ({
                applicable: false,
              } satisfies IntegrationAssessment)
        }

        const state = yield* detect(cwd)
        const workspace = options.workspace({ isMonorepo, lintConfig })
        const packageActions = getPackageActions(packageJson, options, options.purpose)
        const configContent = options.configContent(workspace)

        const inspection =
          state.active._tag === "Current"
            ? options.inspectConfig(yield* readFile(state.active.file.path), workspace)
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
            ...legacyFindings,
          ],
          packageActions,
          warnings: state.warnings,
        } satisfies IntegrationAssessment
      }),
    config: options.configFiles.config,
    create: (cwd: string) =>
      Effect.gen(function* () {
        const path = yield* Path.Path
        yield* writeFile(
          path.join(cwd, options.configFiles.config),
          options.configContent(options.workspace(yield* readToolingFacts(cwd)))
        )
      }),
    detect,
    files,
    kind: "tooling",
    name: options.name,
    version: options.version,
  })
}
