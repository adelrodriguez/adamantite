import type { JsonObject, JsonValue, PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { Finding } from "#lib/integrations/base.ts"
import { defineManagedPlugin } from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFileIfExists, writeJsonFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonArray, checkIsJsonObject, parseJson } from "#lib/shared/json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { readPackageJson, writePackageJson } from "#lib/workspace/package-json.ts"

const NAME = "@effect/tsgo"
const PREPARE_SCRIPT = "prepare"
// The `effecttsgo` rules exist only in the patched Oxlint and oxlint-tsgolint binaries. The patched
// `tsc` gives editors Effect quick fixes, refactors, and hovers.
const PATCH_COMMAND = "effect-tsgo patch --oxlint --typescript"
const TSCONFIG_FILE = "tsconfig.json"
const LANGUAGE_SERVICE = "@effect/language-service"
// Oxlint reports the Effect diagnostics, so the language service turns its own off and `tsc` and
// the editor do not report each one a second time.
const LANGUAGE_SERVICE_PLUGIN = { diagnostics: false, name: LANGUAGE_SERVICE }
const TSCONFIG_REFERENCE = `${JSON.stringify(
  { compilerOptions: { plugins: [LANGUAGE_SERVICE_PLUGIN] } },
  null,
  2
)}\n`

const MONOREPO_TSCONFIG_GUIDANCE = `Skipping the root \`${TSCONFIG_FILE}\` check for \`${NAME}\`: in a monorepo, add \`${JSON.stringify(LANGUAGE_SERVICE_PLUGIN)}\` to \`compilerOptions.plugins\` in each package's \`${TSCONFIG_FILE}\` or in a shared base config.`

function checkRunsPatch(command: string | undefined) {
  return (
    command !== undefined
    && command.includes("effect-tsgo patch")
    && command.includes("--oxlint")
    && command.includes("--typescript")
  )
}

function findLanguageServicePlugin(plugins: JsonValue | undefined) {
  return checkIsJsonArray(plugins)
    ? plugins.find(
        (plugin): plugin is JsonObject =>
          checkIsJsonObject(plugin) && plugin["name"] === LANGUAGE_SERVICE
      )
    : undefined
}

function getPrepareFindings(packageJson: PackageJson): Finding[] {
  const command = packageJson.scripts?.[PREPARE_SCRIPT]

  if (checkRunsPatch(command)) {
    return []
  }

  return [
    {
      currentState:
        command === undefined
          ? `\`package.json\` has no \`${PREPARE_SCRIPT}\` script, so nothing patches Oxlint for the \`effecttsgo\` rules after an install.`
          : `The \`${PREPARE_SCRIPT}\` script (\`${command}\`) does not run \`${PATCH_COMMAND}\`.`,
      goal: [
        `Make the \`${PREPARE_SCRIPT}\` script in \`package.json\` run \`${PATCH_COMMAND}\`. Keep every command that the script already runs.`,
        "Run the script once, so the installed Oxlint, oxlint-tsgolint, and TypeScript binaries are patched.",
      ],
      id: "missing-effect-tsgo-patch",
      integration: NAME,
      notes: [
        "Without the patch, Oxlint stops with `Unknown plugin: 'effecttsgo'`.",
        "Package managers run `prepare` after each install, so the patch stays applied when Oxlint, oxlint-tsgolint, or TypeScript change.",
      ],
      title: "Missing @effect/tsgo patch step",
    },
  ]
}

const assessTsconfig = Effect.fn("assessEffectTsgoTsconfig")(function* (cwd: string) {
  if (yield* checkIsMonorepo(cwd)) {
    return { findings: [], warnings: [MONOREPO_TSCONFIG_GUIDANCE] }
  }

  const path = yield* Path.Path
  const configPath = path.join(cwd, TSCONFIG_FILE)
  const content = yield* readFileIfExists(configPath)
  const plugin =
    content._tag === "None"
      ? undefined
      : yield* parseJson(content.value, configPath).pipe(
          Effect.map((config) =>
            checkIsJsonObject(config) && checkIsJsonObject(config["compilerOptions"])
              ? findLanguageServicePlugin(config["compilerOptions"]["plugins"])
              : undefined
          )
        )

  if (plugin?.["diagnostics"] === false) {
    return { findings: [], warnings: [] }
  }

  const finding: Finding = {
    currentState:
      plugin === undefined
        ? `\`${TSCONFIG_FILE}\` does not configure the \`${LANGUAGE_SERVICE}\` plugin.`
        : `The \`${LANGUAGE_SERVICE}\` plugin in \`${TSCONFIG_FILE}\` reports its own diagnostics, so \`tsc\` and the editor repeat every Oxlint report.`,
    goal: [
      `Add \`${JSON.stringify(LANGUAGE_SERVICE_PLUGIN)}\` to \`compilerOptions.plugins\` in \`${TSCONFIG_FILE}\`, or set \`diagnostics\` to \`false\` in the existing entry. Keep every other plugin and option.`,
    ],
    id: "missing-effect-language-service-plugin",
    integration: NAME,
    notes: [
      "The `effecttsgo` rules read their options, such as `allowedUnstableApis`, from this entry.",
    ],
    reference: { content: TSCONFIG_REFERENCE, language: "json" },
    title: "Effect language service is not configured",
  }

  return { findings: [finding], warnings: [] }
})

const plugin = defineManagedPlugin({
  name: NAME,
  preset: "effect",
  version: getDependencyVersion("@effect/tsgo"),
})

export default {
  ...plugin,
  /**
   * Add the patch command as the `prepare` script when the project has none. An existing `prepare`
   * script is kept, because Adamantite cannot merge shell commands safely; doctor reports it.
   */
  addPrepareScript: (cwd: string) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(cwd)
      const command = packageJson.scripts?.[PREPARE_SCRIPT]

      if (checkRunsPatch(command)) {
        return "present" as const
      }

      if (command !== undefined && command !== "") {
        return "conflict" as const
      }

      packageJson.scripts = { ...packageJson.scripts, [PREPARE_SCRIPT]: PATCH_COMMAND }
      yield* writePackageJson(cwd, packageJson)

      return "added" as const
    }),
  /**
   * Add the language service plugin entry to the root `tsconfig.json`, or set `diagnostics` to
   * `false` in an existing entry.
   */
  addTsconfigPlugin: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const configPath = path.join(cwd, TSCONFIG_FILE)
      const content = yield* readFileIfExists(configPath)

      if (content._tag === "None") {
        return "missing" as const
      }

      const config = yield* parseJson(content.value, configPath)

      if (!checkIsJsonObject(config)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const compilerOptions = config["compilerOptions"] ?? {}

      if (!checkIsJsonObject(compilerOptions)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const plugins = compilerOptions["plugins"] ?? []

      if (!checkIsJsonArray(plugins)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const existing = findLanguageServicePlugin(plugins)
      const nextPlugins = existing
        ? plugins.map((entry) => (entry === existing ? { ...existing, diagnostics: false } : entry))
        : [...plugins, LANGUAGE_SERVICE_PLUGIN]

      yield* writeJsonFile(configPath, {
        ...config,
        compilerOptions: { ...compilerOptions, plugins: nextPlugins },
      })

      return "updated" as const
    }),
  assess: (cwd: string, packageJson: PackageJson) =>
    Effect.gen(function* () {
      const assessment = yield* plugin.assess(cwd, packageJson)

      if (!assessment.applicable) {
        return assessment
      }

      const tsconfig = yield* assessTsconfig(cwd)

      return {
        ...assessment,
        findings: [
          ...assessment.findings,
          ...getPrepareFindings(packageJson),
          ...tsconfig.findings,
        ],
        warnings: [...assessment.warnings, ...tsconfig.warnings],
      }
    }),
  monorepoTsconfigGuidance: MONOREPO_TSCONFIG_GUIDANCE,
  patchCommand: PATCH_COMMAND,
  prepareScript: PREPARE_SCRIPT,
}
