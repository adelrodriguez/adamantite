import type * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { Finding } from "#lib/integrations/base.ts"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"
import type { ConfigLoadFailed } from "#lib/shared/errors.ts"
import { readConfig } from "#lib/project/config-loader.ts"

/**
 * A TypeScript config that a tool integration renders whole, and the legacy JSON configs that the
 * tool read before it.
 */
export interface ConfigFile {
  readonly legacy: readonly string[]
  readonly path: string
  readonly tool: string
  /**
   * Why the project cannot keep a legacy config beside the managed one, such as "Oxfmt loads no
   * config when it finds both".
   */
  readonly whyLegacyBlocks: string
}

/**
 * The legacy JSON configs of `config` that the project at `cwd` has.
 */
export const findLegacyConfigs = Effect.fn("findLegacyConfigs")(function* (
  cwd: string,
  config: ConfigFile
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.filter(config.legacy, (file) => fs.exists(path.join(cwd, file)), {
    concurrency: "unbounded",
  })
})

/**
 * The managed config of the project at `cwd`, or nothing when a legacy config is there. The tool
 * would not load the managed config beside it, so the project gets the legacy finding instead.
 */
export const renderConfigFile = Effect.fn("renderConfigFile")(function* (
  cwd: string,
  config: ConfigFile,
  content: string
) {
  const legacy = yield* findLegacyConfigs(cwd, config)

  return legacy.length > 0 ? [] : [{ content, path: config.path }]
})

function listFiles(files: readonly string[]) {
  return files.map((file) => `\`${file}\``).join(", ")
}

/**
 * The managed config of the project at `cwd`, loaded as the tool loads it and decoded with
 * `schema`, or none when it does not exist.
 */
export const readConfigFile = Effect.fn("readConfigFile")(function* <A>(
  cwd: string,
  config: ConfigFile,
  schema: Schema.Decoder<A>
) {
  const path = yield* Path.Path

  return yield* readConfig(cwd, path.join(cwd, config.path), schema)
})

/**
 * The findings for a managed config, as `readConfigFile` reads it: a legacy JSON config, a missing
 * config, a config that does not load, and a loaded config that `inspect` rejects. `reference` is
 * what Adamantite writes.
 */
export const assessConfigFile = Effect.fn("assessConfigFile")(function* <A>(
  cwd: string,
  config: ConfigFile,
  content: Option.Option<Result.Result<A, ConfigLoadFailed>>,
  reference: string,
  inspect: (config: A) => RequiredConfigInspection
) {
  const legacy = yield* findLegacyConfigs(cwd, config)

  const code = { content: reference, language: "ts" } as const

  if (legacy.length > 0) {
    return [
      {
        currentState: Option.isNone(content)
          ? `The project configures ${config.tool} in the legacy ${listFiles(legacy)}, so Adamantite does not write \`${config.path}\`.`
          : `The project has ${listFiles(legacy)} beside \`${config.path}\`, and ${config.whyLegacyBlocks}.`,
        goal: [
          `Move the project settings into \`${config.path}\`, using the reference content as the base, and delete ${listFiles(legacy)}.`,
          "Run `adamantite update`, then `adamantite doctor`. It must not report this finding.",
        ],
        id: `legacy-${config.tool}-config`,
        integration: config.tool,
        notes: [
          "Preserve project-specific settings. Do not replace them with the reference defaults.",
        ],
        reference: code,
        title: `Legacy ${config.tool} configuration`,
      },
    ] satisfies readonly Finding[]
  }

  if (Option.isNone(content)) {
    return [
      {
        currentState: `The selection runs ${config.tool}, and \`${config.path}\` does not exist.`,
        goal: [
          `Run \`adamantite update\`. It writes \`${config.path}\`.`,
          "Run `adamantite doctor` again. It must not report this finding.",
        ],
        id: `missing-${config.tool}-config`,
        integration: config.tool,
        reference: code,
        title: `Missing ${config.tool} configuration`,
      },
    ] satisfies readonly Finding[]
  }

  const inspection: RequiredConfigInspection = Result.match(content.value, {
    onFailure: (error) => ({
      goal: `Repair the error, so that \`${config.path}\` loads, as ${config.tool} loads it. Preserve every project setting.`,
      kind: "invalid",
      reason: error.message,
    }),
    onSuccess: inspect,
  })

  return inspection.kind === "invalid"
    ? [
        {
          currentState: `\`${config.path}\` does not meet Adamantite's required shape. ${inspection.reason}`,
          goal: [inspection.goal],
          id: `invalid-${config.tool}-config`,
          integration: config.tool,
          notes: ["Treat the reference as a known-good example, not an exact replacement."],
          reference: code,
          title: `Invalid ${config.tool} configuration`,
        } satisfies Finding,
      ]
    : []
})
