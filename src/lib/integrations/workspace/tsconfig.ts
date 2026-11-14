import type { JsonObject, JsonValue, PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as Jsonc from "effect/encoding/Jsonc"
import * as Equal from "effect/Equal"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { Project } from "#lib/workspace/project.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { FailedToParseFile, InvalidConfigFormat, JsoncNotEditable } from "#lib/shared/errors.ts"
import { readFile, readFileIfExists, writeJsonFile } from "#lib/shared/filesystem.ts"
import {
  checkIsJsonObject,
  checkIsPlainJson,
  mergeConfig,
  stringifyJson,
} from "#lib/shared/json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const

/**
 * The values of `--typescript`. `typescript` adds the type resets to the strict options of
 * `tsconfig`, so a config that extends both counts as `typescript`.
 */
export const TYPESCRIPT_PRESET_NAMES = ["typescript", "tsconfig"] as const

export type TypeScriptPreset = (typeof TYPESCRIPT_PRESET_NAMES)[number]

/**
 * The import that `extends` names for each TypeScript preset.
 */
export const TYPESCRIPT_PRESETS = {
  tsconfig: publicImport("./tsconfig"),
  typescript: publicImport("./typescript"),
} as const satisfies Record<TypeScriptPreset, string>

const PRESET_IMPORTS: readonly string[] = Object.values(TYPESCRIPT_PRESETS)

export function getMonorepoGuidance(preset: TypeScriptPreset) {
  const guidance = [
    "Adamantite leaves the root `tsconfig.json` unchanged in a monorepo.",
    `Add \`"extends": "${TYPESCRIPT_PRESETS[preset]}"\` to each package's \`tsconfig.json\` or to a shared base config.`,
  ]

  if (preset === "typescript") {
    guidance.push(`In a library package, extend \`${TYPESCRIPT_PRESETS.tsconfig}\` instead.`)
  }

  return guidance
}

// Later entries in an `extends` array override earlier ones, so the preset is appended last when
// Adamantite adds it. An array that already contains the preset is kept in the user's order, even
// when the preset is not last. The other Adamantite preset is removed, because a config extends
// one of them.
function mergeExtends(existing: JsonValue | undefined, preset: TypeScriptPreset) {
  const presetImport = TYPESCRIPT_PRESETS[preset]

  if (Predicate.isString(existing)) {
    if (existing === presetImport || PRESET_IMPORTS.includes(existing)) {
      return presetImport
    }

    return [existing, presetImport]
  }

  if (Array.isArray(existing)) {
    const kept = existing.filter(
      (entry) =>
        entry === presetImport || !Predicate.isString(entry) || !PRESET_IMPORTS.includes(entry)
    )

    return kept.includes(presetImport) ? kept : [...kept, presetImport]
  }

  return presetImport
}

// The type resets that `adamantite/typescript` lists in `files`, at the end of their path in the
// installed package.
const RESETS_FILE = "/dist/presets/typescript/resets/index.d.ts"

const ShowConfig = Schema.Struct({ files: Schema.optional(Schema.Array(Schema.String)) })
const decodeShowConfig = Schema.decodeUnknownOption(ShowConfig)

/**
 * Whether the `tsconfig.json` in `directory` loads the type resets, by the files that the project's
 * own TypeScript resolves with `tsc --showConfig`. TypeScript follows `extends` by its own rules,
 * and a config that sets its own `files` drops the resets. None when TypeScript is not installed or
 * the command fails.
 */
const readLoadsResets = Effect.fn("readLoadsResets")(
  function* (directory: string) {
    const path = yield* Path.Path
    const typescript = yield* resolvePackageDirectory(directory, "typescript")

    if (Option.isNone(typescript)) {
      return Option.none<boolean>()
    }

    const manifest = yield* Effect.option(readPackageJson(typescript.value))

    const bin = Option.flatMapNullishOr(manifest, ({ bin: entries }) =>
      Predicate.isObject(entries) ? entries.tsc : undefined
    )

    if (Option.isNone(bin) || !Predicate.isString(bin.value)) {
      return Option.none<boolean>()
    }

    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const handle = yield* spawner.spawn(
      ChildProcess.make(
        "node",
        [path.join(typescript.value, bin.value), "--showConfig", "--project", directory],
        { cwd: directory, stdin: "ignore" }
      )
    )

    const [stdout, , exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.runDrain(handle.stderr),
        handle.exitCode,
      ],
      { concurrency: "unbounded" }
    )

    if (exitCode !== 0) {
      return Option.none<boolean>()
    }

    const config = Result.getSuccess(
      Jsonc.parse(stdout).pipe(Result.flatMap(Schema.decodeUnknownResult(Schema.Json)))
    )

    return Option.flatMap(config, (value) =>
      Option.map(decodeShowConfig(value), (showConfig) =>
        (showConfig.files ?? []).some((file) => file.endsWith(RESETS_FILE))
      )
    )
  },
  Effect.scoped,
  Effect.catchTag("PlatformError", () => Effect.succeed(Option.none<boolean>()))
)

/**
 * The `extends` entries of a `tsconfig.json`. None when the file is not a JSON object.
 */
function readExtends(config: JsonValue) {
  if (!Predicate.isObject(config)) {
    return []
  }

  return (Array.isArray(config.extends) ? config.extends : [config.extends]).filter(
    Predicate.isString
  )
}

// Another project imports a package that is not private and declares `exports` or `types`, so it
// can read the declaration files that the package emits.
function checkPublishesTypes(packageJson: PackageJson) {
  return (
    packageJson.private !== true
    && (packageJson.exports !== undefined || packageJson.types !== undefined)
  )
}

function toLibraryFinding(configPath: string): Finding {
  return {
    currentState: `\`${configPath}\` loads the type resets of \`${TYPESCRIPT_PRESETS.typescript}\`, directly or through a base config, and its \`package.json\` is not private and declares \`exports\` or \`types\`.`,
    goal: [
      `Make \`${configPath}\` extend \`${TYPESCRIPT_PRESETS.tsconfig}\` instead of reaching \`${TYPESCRIPT_PRESETS.typescript}\`, directly or through a base config. Keep a shared base for the packages that use it, and preserve every other setting.`,
    ],
    id: "typescript-preset-in-library",
    integration: "tsconfig",
    notes: [
      `\`${TYPESCRIPT_PRESETS.typescript}\` adds the type resets. A declaration file that the library emits can name the global \`AdamantiteTypeScript\` helper types, which projects without the resets do not have.`,
    ],
    title: "Type resets in a library",
  }
}

export default defineIntegration({
  // Doctor checks only the packages that chose a preset, so a project that declined it in init
  // gets no finding. Oxlint's type check runs without a `tsconfig.json`. A config without
  // `extends` cannot load the type resets, so Doctor runs TypeScript only for the others.
  assess: ({ cwd, packageJson, workspace }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path

      const packages = yield* Effect.forEach(
        [cwd, ...workspace.packageDirectories],
        (directory) =>
          Effect.gen(function* () {
            const content = yield* readFileIfExists(path.join(directory, files[0].path))

            if (Option.isNone(content)) {
              return []
            }

            const config = Result.getSuccess(
              Json5.parse(content.value).pipe(
                Result.flatMap(Schema.decodeUnknownResult(Schema.Json))
              )
            )

            const entries = Option.match(config, { onNone: () => [], onSome: readExtends })

            const loadsResets =
              entries.length === 0
                ? false
                : Option.getOrElse(yield* readLoadsResets(directory), () => false)

            const namesPreset = entries.some((entry) => PRESET_IMPORTS.includes(entry))

            return namesPreset || loadsResets ? [{ directory, loadsResets }] : []
          }),
        { concurrency: 4 }
      )

      const configured = packages.flat()

      if (configured.length === 0) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const findings = yield* Effect.forEach(
        configured,
        ({ directory, loadsResets }) =>
          loadsResets
            ? (directory === cwd ? Effect.succeed(packageJson) : readPackageJson(directory)).pipe(
                Effect.map((manifest) =>
                  checkPublishesTypes(manifest)
                    ? [toLibraryFinding(path.relative(cwd, path.join(directory, files[0].path)))]
                    : []
                )
              )
            : Effect.succeed([]),
        { concurrency: "unbounded" }
      )

      return {
        applicable: true,
        findings: findings.flat(),
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  config: files[0].path,
  create: (cwd: string, preset: TypeScriptPreset) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJsonFile(path.join(cwd, files[0].path), { extends: TYPESCRIPT_PRESETS[preset] })
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  files,
  kind: "workspace",
  name: "tsconfig",
  update: (cwd: string, preset: TypeScriptPreset) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      const tsconfigFile = yield* readFile(configPath)

      const existingConfig = yield* Effect.fromResult(Json5.parse(tsconfigFile)).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.mapError((cause) => new FailedToParseFile({ cause, path: configPath }))
      )

      if (!checkIsJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const merged = yield* mergeConfig({
        fallback: { extends: TYPESCRIPT_PRESETS[preset] },
        preferred: existingConfig,
      })

      // Effect's JsonObject interface triggers no-misused-spread, so rebuild the plain JSON object.
      const newConfig: JsonObject = Object.fromEntries([
        ...Object.entries(merged),
        [
          "extends",
          mergeExtends("extends" in existingConfig ? existingConfig.extends : undefined, preset),
        ],
      ])

      // A file that already holds the managed values needs no write, also when it has comments.
      if (Equal.equals(existingConfig, newConfig)) {
        return
      }

      if (!checkIsPlainJson(tsconfigFile)) {
        return yield* new JsoncNotEditable({
          change: `Set \`extends\` to \`${yield* stringifyJson(newConfig.extends)}\`.`,
          path: configPath,
        })
      }

      yield* writeJsonFile(configPath, newConfig)
    }),
})
