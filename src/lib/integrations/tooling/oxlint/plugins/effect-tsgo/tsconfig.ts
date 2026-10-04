import type { JsonObject, JsonValue } from "type-fest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { Finding } from "#lib/integrations/base.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonArray, checkIsJsonObject, parseJson, updateJsonText } from "#lib/shared/json.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"

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

function findLanguageServicePlugin(plugins: JsonValue | undefined) {
  return checkIsJsonArray(plugins)
    ? plugins.find(
        (plugin): plugin is JsonObject =>
          checkIsJsonObject(plugin) && plugin["name"] === LANGUAGE_SERVICE
      )
    : undefined
}

/**
 * A finding when the root `tsconfig.json` lacks the language service entry, or the entry reports
 * its own diagnostics. A monorepo gets guidance instead, as the tsconfig integration does.
 */
export const assessTsconfigPlugin = Effect.fn("assessTsconfigPlugin")(function* (
  cwd: string,
  integration: string
) {
  if (yield* checkIsMonorepo(cwd)) {
    return {
      findings: [],
      warnings: [
        `Skipping the root \`${TSCONFIG_FILE}\` check for \`${integration}\`: in a monorepo, add \`${JSON.stringify(LANGUAGE_SERVICE_PLUGIN)}\` to \`compilerOptions.plugins\` in each package's \`${TSCONFIG_FILE}\` or in a shared base config.`,
      ],
    }
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
    integration,
    notes: [
      "The `effecttsgo` rules read their options, such as `allowedUnstableApis`, from this entry.",
    ],
    reference: { content: TSCONFIG_REFERENCE, language: "json" },
    title: "Effect language service is not configured",
  }

  return { findings: [finding], warnings: [] }
})

/**
 * Add the language service entry to the root `tsconfig.json`, or set `diagnostics` to `false` in an
 * existing entry. A monorepo has no root config to change.
 */
export const updateTsconfigPlugin = Effect.fn("updateTsconfigPlugin")(function* (cwd: string) {
  if (yield* checkIsMonorepo(cwd)) {
    return "monorepo" as const
  }

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

  yield* writeFile(
    configPath,
    updateJsonText(content.value, {
      ...config,
      compilerOptions: { ...compilerOptions, plugins: nextPlugins },
    })
  )

  return "updated" as const
})
