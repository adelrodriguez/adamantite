import type { JsonObject } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import migrationLegacyZedOxfmtSettings from "#lib/migrations/legacy-zed-oxfmt-settings.ts"

const ROOT = "/project"

const SETTINGS_PATH = ".zed/settings.json"

const LEGACY_OXFMT_SETTINGS = {
  configPath: null,
  "fmt.experimental": true,
  run: "onSave",
  typeAware: false,
  unusedDisableDirectives: false,
}

function makeSettings(oxfmtSettings: JsonObject) {
  return JSON.stringify(
    {
      lsp: {
        oxfmt: { initialization_options: { settings: oxfmtSettings } },
        oxlint: { initialization_options: { settings: { run: "onType", typeAware: true } } },
      },
      ui_font_size: 14,
    },
    null,
    2
  )
}

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("legacyZedOxfmtSettings", () => {
  it.effect("check reports not-applicable when the settings file does not exist", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* migrationLegacyZedOxfmtSettings
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check reports not-applicable when the oxfmt settings are already clean", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        [SETTINGS_PATH]: makeSettings({ "fmt.configPath": null, run: "onSave" }),
      })

      const result = yield* migrationLegacyZedOxfmtSettings
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check reports needed when the old preset's oxfmt settings are present", () =>
    Effect.gen(function* () {
      const files = makeFiles({ [SETTINGS_PATH]: makeSettings(LEGACY_OXFMT_SETTINGS) })

      const result = yield* migrationLegacyZedOxfmtSettings
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({
        status: "needed",
        summary:
          "Removing lint-only and deprecated settings from the Zed oxfmt language server configuration.",
        warnings: [],
      })
    })
  )

  it.effect("migrate removes the stale settings and writes the default fmt.configPath", () =>
    Effect.gen(function* () {
      const files = makeFiles({ [SETTINGS_PATH]: makeSettings(LEGACY_OXFMT_SETTINGS) })

      yield* migrationLegacyZedOxfmtSettings.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const config = JSON.parse(files.read(SETTINGS_PATH))

      expect(config.lsp.oxfmt.initialization_options.settings).toEqual({
        "fmt.configPath": null,
        run: "onSave",
      })
      yield* migrationLegacyZedOxfmtSettings.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate preserves user settings outside the oxfmt settings block", () =>
    Effect.gen(function* () {
      const files = makeFiles({ [SETTINGS_PATH]: makeSettings(LEGACY_OXFMT_SETTINGS) })

      yield* migrationLegacyZedOxfmtSettings.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const config = JSON.parse(files.read(SETTINGS_PATH))

      expect(config.ui_font_size).toBe(14)
      expect(config.lsp.oxlint.initialization_options.settings).toEqual({
        run: "onType",
        typeAware: true,
      })
    })
  )

  it.effect("migrate keeps stale keys whose values the user has edited", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        [SETTINGS_PATH]: makeSettings({
          ...LEGACY_OXFMT_SETTINGS,
          "fmt.configPath": "custom/.oxfmtrc.json",
          typeAware: true,
        }),
      })

      yield* migrationLegacyZedOxfmtSettings.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const config = JSON.parse(files.read(SETTINGS_PATH))

      expect(config.lsp.oxfmt.initialization_options.settings).toEqual({
        "fmt.configPath": "custom/.oxfmtrc.json",
        run: "onSave",
        typeAware: true,
      })
    })
  )
})
