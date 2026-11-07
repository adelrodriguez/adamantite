import process from "node:process"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { EffectEditorUnavailable, InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFile, readFileIfExists, writeJsonFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonObject, parseJson } from "#lib/shared/json.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

export const EFFECT_SDK_PATH = "node_modules/.cache/adamantite/effect"
const SDK_METADATA = "adamantite-sdk.json"
const NATIVE_TYPESCRIPT = Schema.Struct({
  gitHead: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
})

// Match the installed native TypeScript by gitHead, as @effect/tsgo/lib/getExePath does.
// Resolving through Effect services keeps assessment read-only and tests off the host filesystem.
const resolveSdkSource = Effect.fn("resolveSdkSource")(function* (
  cwd: string,
  effectDirectory: string,
  effectVersion: string
) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  let gitHead: string | undefined
  let typescriptVersion = ""

  for (const name of ["typescript", "@typescript/native"]) {
    const directory = yield* resolvePackageDirectory(cwd, name)
    if (Option.isNone(directory)) {
      continue
    }
    const installed = yield* readPackageJson(directory.value)
    if (Number(installed.version?.split(".")[0]) >= 7) {
      const native = Schema.decodeUnknownOption(NATIVE_TYPESCRIPT)(installed)
      if (Option.isSome(native)) {
        gitHead = native.value.gitHead
        typescriptVersion = native.value.version
      }
      break
    }
  }

  if (gitHead === undefined) {
    return yield* new EffectEditorUnavailable({
      reason:
        "The Effect editor SDK needs an installed native TypeScript package with its gitHead. Install TypeScript 7 or later, then run `adamantite init --non-interactive --script check --editor vscode`.",
    })
  }

  const platform = `${process.platform}-${process.arch}`
  const platformDirectory = yield* resolvePackageDirectory(
    effectDirectory,
    `@effect/tsgo-${platform}`
  )
  if (Option.isNone(platformDirectory)) {
    return yield* new EffectEditorUnavailable({
      reason: `The Effect editor SDK cannot find \`@effect/tsgo-${platform}\`. Install the optional dependencies on a supported platform.`,
    })
  }

  const metadataPath = path.join(platformDirectory.value, "lib", "upstream.json")
  const metadata = yield* parseJson(yield* readFile(metadataPath), metadataPath)
  const components = checkIsJsonObject(metadata) && metadata.components
  const builds = checkIsJsonObject(components) && components.typescript
  const tags = checkIsJsonObject(metadata) && metadata.tags
  const typescriptTags = checkIsJsonObject(tags) && tags.typescript
  if (
    !checkIsJsonObject(metadata)
    || metadata.schemaVersion !== 5
    || !checkIsJsonObject(builds)
    || !checkIsJsonObject(typescriptTags)
  ) {
    return yield* new InvalidConfigFormat({ path: metadataPath })
  }

  const executable = process.platform === "win32" ? "tsc.exe" : "tsc"
  for (const [version, build] of Object.entries(builds)) {
    if (!checkIsJsonObject(build) || build.gitHead !== gitHead) {
      continue
    }
    const directory =
      version === typescriptTags.latest
        ? path.join(platformDirectory.value, "lib")
        : path.join(platformDirectory.value, "artifacts", "typescript", version)
    if (
      (yield* fs.exists(path.join(directory, executable)))
      && (yield* fs.exists(path.join(directory, "lib.d.ts")))
    ) {
      return { effectVersion, executable, gitHead, platform, source: directory, typescriptVersion }
    }
  }

  return yield* new EffectEditorUnavailable({
    reason: `@effect/tsgo ${effectVersion} has no editor compiler matching TypeScript ${typescriptVersion} (${gitHead}). Install a supported TypeScript version, then run \`adamantite init --non-interactive --script check --editor vscode\`.`,
  })
})

const sdkIsCurrent = Effect.fn("sdkIsCurrent")(function* (
  cwd: string,
  source: Effect.Success<ReturnType<typeof resolveSdkSource>>
) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const sdk = path.join(cwd, EFFECT_SDK_PATH)
  const metadataPath = path.join(sdk, SDK_METADATA)
  const content = yield* readFileIfExists(metadataPath)
  if (Option.isNone(content)) {
    return false
  }
  const metadata = yield* parseJson(content.value, metadataPath).pipe(
    Effect.catchTag("FailedToParseFile", () => Effect.succeed(null))
  )
  if (
    !checkIsJsonObject(metadata)
    || !Object.entries(source).every(([key, value]) => metadata[key] === value)
  ) {
    return false
  }
  const entries = yield* fs.readDirectory(source.source)
  const copied = yield* Effect.forEach(
    entries.filter((name) => name === source.executable || name.endsWith(".d.ts")),
    (name) => fs.exists(path.join(sdk, name))
  )
  return copied.every(Boolean)
})

/**
 * Shared facts for the editor integrations. Each editor owns its settings. Only VS Code needs a
 * local SDK copy; Zed starts the installed upstream CLI directly.
 */
export const readEffectEditor = Effect.fn("readEffectEditor")(function* (cwd: string) {
  const directory = yield* resolvePackageDirectory(cwd, "@effect/tsgo")
  if (Option.isNone(directory)) {
    return Option.none()
  }
  const path = yield* Path.Path
  const manifest = yield* readPackageJson(directory.value)
  const presetPath = path.join(directory.value, "oxlint-schema.json")
  const preset = yield* parseJson(yield* readFile(presetPath), presetPath)
  const definitions = checkIsJsonObject(preset) && preset.definitions
  const rules = checkIsJsonObject(definitions) && definitions["DummyRuleMap"]
  const properties = checkIsJsonObject(rules) && rules["properties"]
  if (!checkIsJsonObject(properties)) {
    return yield* new InvalidConfigFormat({ path: presetPath })
  }
  // The schema lists every Effect rule, including rules excluded from upstream presets.
  const rulesCustomization = Object.fromEntries(
    Object.keys(properties)
      .filter((rule) => rule.startsWith("effecttsgo/"))
      .map((rule) => [rule, { severity: "off" }])
  ) satisfies Schema.JsonObject
  const source = resolveSdkSource(cwd, directory.value, manifest.version ?? "unknown")

  return Option.some({
    prepareSdk: Effect.gen(function* () {
      const resolved = yield* source
      if (yield* sdkIsCurrent(cwd, resolved)) {
        return
      }
      const fs = yield* FileSystem.FileSystem
      const sdk = path.join(cwd, EFFECT_SDK_PATH)
      yield* fs.remove(sdk, { force: true, recursive: true })
      yield* fs.makeDirectory(path.dirname(sdk), { recursive: true })
      yield* fs.copy(resolved.source, sdk)
      yield* writeJsonFile(path.join(sdk, SDK_METADATA), resolved)
    }),
    rulesCustomization,
    sdkIsCurrent: source.pipe(Effect.flatMap((resolved) => sdkIsCurrent(cwd, resolved))),
  })
})
