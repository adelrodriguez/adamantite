import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
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
  matchDeclaredVersion,
  parseDependencySpecifier,
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
 * The tool has no config.
 */
export class MissingToolingConfig extends Data.TaggedClass("Missing") {}

/**
 * The tool uses the latest supported TypeScript config.
 */
export class CurrentToolingConfig extends Data.TaggedClass("Current")<{
  readonly file: ToolingConfigFileState
}> {}

/**
 * The tool uses a legacy JSON or JSONC config.
 */
export class LegacyToolingConfig extends Data.TaggedClass("Legacy")<{
  readonly file: ToolingConfigFileState
}> {}

/**
 * The config that the tool uses.
 */
export type ActiveToolingConfig = MissingToolingConfig | CurrentToolingConfig | LegacyToolingConfig

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
  readonly config: `${string}.ts`
  /**
   * Legacy config files. When several exist, `jsonc` wins over `json` as the active one. Detection
   * tells a legacy config by its extension, so each one is a JSON or JSONC file.
   */
  readonly legacyConfigs: ReadonlyArray<`${string}.json` | `${string}.jsonc`>
}

export type RequiredConfigInspection =
  | { readonly kind: "configured" }
  | {
      /**
       * The repair for `reason`.
       */
      readonly goal: string
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
  if (active instanceof MissingToolingConfig || legacy.length === 0) {
    return []
  }

  if (active instanceof CurrentToolingConfig) {
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
    onNone: (): ActiveToolingConfig => new MissingToolingConfig(),
    onSome: (candidate): ActiveToolingConfig =>
      candidate.format === "ts"
        ? new CurrentToolingConfig({ file: toFile(candidate) })
        : new LegacyToolingConfig({ file: toFile(candidate) }),
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

export interface PackageAssessment {
  readonly findings: readonly Finding[]
  readonly packageActions: readonly PackageAction[]
  readonly warnings: readonly string[]
}

const CURRENT: PackageAssessment = { findings: [], packageActions: [], warnings: [] }

/**
 * Compare the version that the project declares for a managed package with the version that
 * Adamantite requires. `adamantite update` installs a missing or outdated package. A version from a
 * pnpm catalog needs a change to the catalog, which `update` does not make, because `pnpm add`
 * replaces the `catalog:` specifier.
 */
export function assessPackage(
  { packageJson, workspace: { catalogs } }: Pick<Project, "packageJson" | "workspace">,
  pkg: ToolingPackage,
  purpose: string,
  integration: string
): PackageAssessment {
  const specifier = packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

  if (!specifier) {
    return {
      findings: [
        {
          currentState: `The required package \`${pkg.name}\` is not installed.`,
          goal: [`Run \`adamantite update\` so \`${pkg.name}@${pkg.version}\` is installed.`],
          id: `missing-${pkg.name}`,
          integration,
          title: `Missing ${pkg.name}`,
        },
      ],
      packageActions: [
        {
          description: `Install \`${pkg.name}@${pkg.version}\` for ${purpose}.`,
          package: pkg.name,
          targetVersion: pkg.version,
          type: "install_package",
        },
      ],
      warnings: [],
    }
  }

  function unreadable(declared: string): PackageAssessment {
    return {
      findings: [],
      packageActions: [],
      warnings: [
        `\`${pkg.name}\` is declared as \`${declared}\`, so Adamantite cannot check it against the required version \`${pkg.version}\`.`,
      ],
    }
  }

  function outdatedCatalog(catalog: string, entry: string): PackageAssessment {
    const catalogName = catalog === "default" ? "the `catalog`" : `the \`${catalog}\` catalog`

    return {
      findings: [
        {
          currentState: `${catalogName} of \`pnpm-workspace.yaml\` sets \`${pkg.name}\` to \`${entry}\`, but Adamantite requires \`${pkg.version}\`.`,
          goal: [
            `Set \`${pkg.name}\` to \`${pkg.version}\` in ${catalogName} of \`pnpm-workspace.yaml\`, then install the dependencies.`,
          ],
          id: `outdated-${pkg.name}`,
          integration,
          notes: [
            "Keep the `catalog:` specifier in `package.json`. `adamantite update` does not change catalogs.",
          ],
          title: `Outdated ${pkg.name}`,
        },
      ],
      packageActions: [],
      warnings: [],
    }
  }

  return matchDeclaredVersion(parseDependencySpecifier(specifier), {
    Catalog: ({ catalog }) => {
      const entry = catalogs[catalog]?.[pkg.name]

      if (entry === undefined) {
        return unreadable(specifier)
      }

      // A catalog entry is itself a specifier, but a catalog cannot refer to another catalog.
      return matchDeclaredVersion(parseDependencySpecifier(entry), {
        Catalog: () => unreadable(specifier),
        Unreadable: () => unreadable(specifier),
        Version: ({ version }) =>
          version === pkg.version ? CURRENT : outdatedCatalog(catalog, entry),
      })
    },
    Unreadable: () => unreadable(specifier),
    Version: ({ version }): PackageAssessment =>
      version === pkg.version
        ? CURRENT
        : {
            findings: [
              {
                currentState: `The installed \`${pkg.name}\` version is \`${specifier}\`, but Adamantite requires \`${pkg.version}\`.`,
                goal: [`Run \`adamantite update\` so \`${pkg.name}@${pkg.version}\` is installed.`],
                id: `outdated-${pkg.name}`,
                integration,
                title: `Outdated ${pkg.name}`,
              },
            ],
            packageActions: [
              {
                currentVersion: specifier,
                description: `Update \`${pkg.name}\` from \`${specifier}\` to \`${pkg.version}\`.`,
                package: pkg.name,
                targetVersion: pkg.version,
                type: "update_package",
              },
            ],
            warnings: [],
          },
  })
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
    readonly toolName: string
  }
): Finding[] {
  if (state.active instanceof MissingToolingConfig) {
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

  if (state.active instanceof LegacyToolingConfig) {
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
      goal: [options.inspection.goal],
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
   * Findings for retired managed packages. While any exist, the integration stays applicable and
   * reports them so the packages get removed.
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

        const pkg = assessPackage(project, options, options.purpose, options.name)

        return {
          applicable: true,
          findings: [...pkg.findings, ...legacyFindings],
          packageActions: pkg.packageActions,
          warnings: pkg.warnings,
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
    assess: (project: Project) =>
      Effect.gen(function* () {
        const {
          cwd,
          lintConfig,
          packageJson,
          workspace: { isMonorepo },
        } = project

        if (!checkHasManagedScript(packageJson, options.scripts)) {
          return { applicable: false } satisfies IntegrationAssessment
        }

        const state = yield* detect(cwd)
        const workspace = options.workspace({ isMonorepo, lintConfig })
        const pkg = assessPackage(project, options, options.purpose, options.name)
        const configContent = options.configContent(workspace)

        const inspection =
          state.active instanceof CurrentToolingConfig
            ? options.inspectConfig(yield* readFile(state.active.file.path), workspace)
            : undefined

        return {
          applicable: true,
          findings: [
            ...pkg.findings,
            ...getConfigFindings(state, {
              configContent,
              configFile: options.configFiles.config,
              inspection,
              toolName: options.name,
            }),
          ],
          packageActions: pkg.packageActions,
          warnings: [...pkg.warnings, ...state.warnings],
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
