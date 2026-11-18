import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { Finding } from "#lib/integrations/base.ts"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"
import type { ConfigLoadFailed } from "#lib/shared/errors.ts"

/**
 * A TypeScript config that a tool integration renders whole, and the tool's own JSON configs, which
 * conflict with it. Oxlint, Oxfmt, and Knip each have one.
 */
export interface ConfigFile {
  readonly conflicting: readonly string[]
  readonly path: string
  readonly tool: string
  /**
   * Why the project cannot keep a conflicting config beside the managed one, such as "Oxfmt loads
   * no config when it finds both".
   */
  readonly whyConflicting: string
}

/**
 * The conflicting JSON configs of `config` that the project at `cwd` has.
 */
const findConflictingConfigs = Effect.fn("findConflictingConfigs")(function* (
  cwd: string,
  config: ConfigFile
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.filter(config.conflicting, (file) => fs.exists(path.join(cwd, file)), {
    concurrency: "unbounded",
  })
})

/**
 * The managed config of the project at `cwd`, or nothing when a conflicting config is there. The
 * tool would not load the managed config beside it, so the project gets the conflict finding
 * instead.
 */
export const renderConfigFile = Effect.fn("renderConfigFile")(function* (
  cwd: string,
  config: ConfigFile,
  content: string
) {
  const conflicting = yield* findConflictingConfigs(cwd, config)

  return conflicting.length > 0 ? [] : [{ content, path: config.path }]
})

function listFiles(files: readonly string[]) {
  return files.map((file) => `\`${file}\``).join(", ")
}

/**
 * The findings for a managed config, as `readConfig` loads it: a conflicting JSON config, a missing
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
  const conflicting = yield* findConflictingConfigs(cwd, config)

  const code = { content: reference, language: "ts" } as const

  if (conflicting.length > 0) {
    return [
      {
        currentState: Option.isNone(content)
          ? `The project configures ${config.tool} in ${listFiles(conflicting)}, so Adamantite does not write \`${config.path}\`.`
          : `The project has ${listFiles(conflicting)} beside \`${config.path}\`, and ${config.whyConflicting}.`,
        goal: [
          `Move the project settings into \`${config.path}\`, using the reference content as the base, and delete ${listFiles(conflicting)}.`,
          "Run `adamantite update`, then `adamantite doctor`. It must not report this finding.",
        ],
        id: `conflicting-${config.tool}-config`,
        integration: config.tool,
        notes: [
          "Preserve project-specific settings. Do not replace them with the reference defaults.",
        ],
        reference: code,
        title: `Conflicting ${config.tool} configuration`,
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
