import type * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import zed from "#lib/integrations/editors/zed.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { MigrationValidationFailed } from "#lib/shared/errors.ts"
import { readFileIfExists, writeJsonFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonObject, parseJson } from "#lib/shared/json.ts"

/**
 * Settings the old Zed preset wrote under the oxfmt language server that the formatter never reads:
 * `configPath`, `typeAware`, and `unusedDisableDirectives` only configure linting, and
 * `fmt.experimental` is deprecated. Only exact value matches are removed so user-edited values
 * survive.
 */
const STALE_OXFMT_SETTINGS = {
  configPath: null,
  "fmt.experimental": true,
  typeAware: false,
  unusedDisableDirectives: false,
} as const satisfies Record<string, Schema.Json>

const STALE_OXFMT_ENTRIES: ReadonlyArray<readonly [string, Schema.Json]> =
  Object.entries(STALE_OXFMT_SETTINGS)

function getZedSettingsPath() {
  return zed.files[0].path
}

function checkIsStaleOxfmtSetting(key: string, value: Schema.Json) {
  return STALE_OXFMT_ENTRIES.some(
    ([staleKey, staleValue]) => staleKey === key && staleValue === value
  )
}

function findOxfmtSettings(config: Schema.JsonObject) {
  const lsp = config.lsp

  if (!checkIsJsonObject(lsp)) {
    return null
  }

  const oxfmt = lsp.oxfmt

  if (!checkIsJsonObject(oxfmt)) {
    return null
  }

  const initializationOptions = oxfmt.initialization_options

  if (!checkIsJsonObject(initializationOptions)) {
    return null
  }

  const settings = initializationOptions.settings

  if (!checkIsJsonObject(settings)) {
    return null
  }

  return { initializationOptions, lsp, oxfmt, settings }
}

const readZedConfig = (cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const settingsPath = path.join(cwd, getZedSettingsPath())
    const content = yield* readFileIfExists(settingsPath)

    if (Option.isNone(content)) {
      return null
    }

    const config = yield* parseJson(content.value, settingsPath)

    if (!checkIsJsonObject(config)) {
      return null
    }

    return { config, settingsPath }
  })

const findStaleOxfmtSettings = (cwd: string) =>
  Effect.gen(function* () {
    const zedConfig = yield* readZedConfig(cwd)
    const target = zedConfig === null ? null : findOxfmtSettings(zedConfig.config)

    if (zedConfig === null || target === null) {
      return null
    }

    const staleKeys = Object.entries(target.settings)
      .filter(([key, value]) => checkIsStaleOxfmtSetting(key, value))
      .map(([key]) => key)

    return { ...zedConfig, ...target, staleKeys }
  })

export default defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const state = yield* findStaleOxfmtSettings(context.cwd)

      if (state === null || state.staleKeys.length === 0) {
        return { status: "not-applicable", warnings: [] } as const
      }

      return {
        status: "needed",
        summary:
          "Removing lint-only and deprecated settings from the Zed oxfmt language server configuration.",
        warnings: [],
      } as const
    }),
  files: [getZedSettingsPath()],
  id: "legacy-zed-oxfmt-settings",
  migrate: (context) =>
    Effect.gen(function* () {
      const state = yield* findStaleOxfmtSettings(context.cwd)

      if (state === null || state.staleKeys.length === 0) {
        return yield* Effect.die(new Error("check() guaranteed stale Zed oxfmt settings exist"))
      }

      // `update` merges through defu, which drops null-valued keys, so the default
      // `fmt.configPath` is written here to converge with a fresh `create`.
      const settings = {
        "fmt.configPath": null,
        ...Object.fromEntries(
          Object.entries(state.settings).filter(
            ([key, value]) => !checkIsStaleOxfmtSetting(key, value)
          )
        ),
      }

      yield* writeJsonFile(state.settingsPath, {
        ...state.config,
        lsp: {
          ...state.lsp,
          oxfmt: {
            ...state.oxfmt,
            initialization_options: {
              ...state.initializationOptions,
              settings,
            },
          },
        },
      })

      return { warnings: [] }
    }),
  tags: ["update"],
  title: "Legacy Zed oxfmt settings",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* findStaleOxfmtSettings(context.cwd)

      if (state !== null && state.staleKeys.length > 0) {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-zed-oxfmt-settings",
          reason: `\`${getZedSettingsPath()}\` still contains stale oxfmt language server settings.`,
        })
      }
    }),
})
