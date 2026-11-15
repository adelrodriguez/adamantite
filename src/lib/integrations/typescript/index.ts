import type * as FileSystem from "effect/FileSystem"
import type { JsonValue, PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as Jsonc from "effect/encoding/Jsonc"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { FailedToReadFile } from "#lib/shared/errors.ts"
import { LANGUAGE_SERVICE_PLUGIN } from "#lib/integrations/effect-language-service.ts"
import { ModuleResolver, resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import {
  type Selection,
  TYPESCRIPT_PRESET_NAMES,
  type TypeScriptPreset,
} from "#lib/project/selection.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { formatJson } from "#lib/shared/json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const CONFIG_PATH = "tsconfig.json"

/**
 * The import that `extends` names for each TypeScript preset.
 */
export const TYPESCRIPT_PRESETS = {
  tsconfig: publicImport("./tsconfig"),
  typescript: publicImport("./typescript"),
} as const satisfies Record<TypeScriptPreset, string>

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

const ADAMANTITE_PRESETS: readonly string[] = Object.values(TYPESCRIPT_PRESETS)

/**
 * The `extends` entries of the TypeScript config at `file` and of each base config that they reach,
 * as TypeScript follows them: a relative or absolute entry names a file, with `.json` added when
 * the file does not exist, and Node.js resolves a package entry that names a `.json` file. The
 * chain stops at an Adamantite preset, and at a base config that does not exist, does not decode,
 * or comes again.
 */
const readExtendsChain = (
  file: string,
  visited: ReadonlySet<string> = new Set()
): Effect.Effect<
  readonly string[],
  FailedToReadFile,
  FileSystem.FileSystem | ModuleResolver | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const resolver = yield* ModuleResolver

    const own = yield* readFileIfExists(file)

    // TypeScript adds `.json` to an entry whose file does not exist.
    const found =
      Option.isSome(own) || file.endsWith(".json")
        ? Option.map(own, (text) => ({ file, text }))
        : Option.map(yield* readFileIfExists(`${file}.json`), (text) => ({
            file: `${file}.json`,
            text,
          }))

    if (Option.isNone(found) || visited.has(found.value.file)) {
      return []
    }

    const entries: readonly string[] = Option.match(
      Result.getSuccess(
        Json5.parse(found.value.text).pipe(Result.flatMap(Schema.decodeUnknownResult(Schema.Json)))
      ),
      { onNone: () => [], onSome: readExtends }
    )

    const directory = path.dirname(found.value.file)

    const bases = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function* () {
          if (ADAMANTITE_PRESETS.includes(entry)) {
            return []
          }

          const base =
            path.isAbsolute(entry) || entry.startsWith("./") || entry.startsWith("../")
              ? Option.some(path.resolve(directory, entry))
              : Option.filter(yield* resolver.resolve(directory, entry), (resolved) =>
                  resolved.endsWith(".json")
                )

          return Option.isNone(base)
            ? []
            : yield* readExtendsChain(base.value, new Set([...visited, found.value.file]))
        }),
      { concurrency: "unbounded" }
    )

    return [...entries, ...bases.flat()]
  })

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

/**
 * The root and the workspace packages whose `tsconfig.json` names an Adamantite preset, directly or
 * through a base config, or loads its type resets, with the presets that the `extends` chain
 * names.
 */
const readConfiguredPackages = Effect.fn("readConfiguredPackages")(function* ({
  cwd,
  workspace,
}: Project) {
  const path = yield* Path.Path

  const packages = yield* Effect.forEach(
    [cwd, ...workspace.packageDirectories],
    (directory) =>
      Effect.gen(function* () {
        const entries = yield* readExtendsChain(path.join(directory, CONFIG_PATH))

        const loadsResets =
          entries.length === 0
            ? false
            : Option.getOrElse(yield* readLoadsResets(directory), () => false)

        const presets = TYPESCRIPT_PRESET_NAMES.filter((preset) =>
          entries.includes(TYPESCRIPT_PRESETS[preset])
        )

        return presets.length > 0 || loadsResets ? [{ directory, loadsResets, presets }] : []
      }),
    { concurrency: 4 }
  )

  return packages.flat()
})

/**
 * The `tsconfig.json` that Adamantite writes for the selection, with the Effect language service
 * entry when the selection includes the `effect` preset.
 */
const render = (selection: Selection, preset: TypeScriptPreset) =>
  formatJson(
    selection.presets.includes("effect")
      ? {
          compilerOptions: { plugins: [LANGUAGE_SERVICE_PLUGIN] },
          extends: TYPESCRIPT_PRESETS[preset],
        }
      : { extends: TYPESCRIPT_PRESETS[preset] }
  ).pipe(Effect.map((content) => `${content}\n`))

function toMissingPresetFinding(
  preset: TypeScriptPreset,
  isMonorepo: boolean,
  reference: string
): Finding {
  const presetImport = TYPESCRIPT_PRESETS[preset]

  const finding: Finding = {
    currentState: isMonorepo
      ? `The lockfile selects \`${presetImport}\`, and no \`tsconfig.json\` of the root or the workspace packages extends an Adamantite TypeScript preset.`
      : `The lockfile selects \`${presetImport}\`, and the root \`tsconfig.json\` is missing or does not extend an Adamantite TypeScript preset.`,
    goal: [
      isMonorepo
        ? `Make the \`tsconfig.json\` of each workspace package, or a base config that they share, extend \`${presetImport}\`. Preserve every other setting.`
        : `Make the root \`tsconfig.json\` extend \`${presetImport}\`. Create the file when it is missing, and preserve every other setting.`,
      "Run `adamantite doctor` again. It must not report this finding.",
    ],
    id: "missing-typescript-preset",
    integration: "tsconfig",
    reference: { content: reference, language: "json" },
    title: "Missing TypeScript preset",
  }

  // `adamantite/typescript` adds the type resets, which a library must not publish.
  return preset === "typescript"
    ? {
        ...finding,
        notes: [`In a library package, extend \`${TYPESCRIPT_PRESETS.tsconfig}\` instead.`],
      }
    : finding
}

function toMismatchedPresetFinding(
  configPath: string,
  selected: TypeScriptPreset,
  used: TypeScriptPreset
): Finding {
  return {
    currentState: `The lockfile selects \`${TYPESCRIPT_PRESETS[selected]}\`, and \`${configPath}\` extends \`${TYPESCRIPT_PRESETS[used]}\`, directly or through a base config.`,
    goal: [
      `Make \`${configPath}\` extend \`${TYPESCRIPT_PRESETS[selected]}\` instead of \`${TYPESCRIPT_PRESETS[used]}\`, directly or through a base config. Keep a shared base for the packages that use it, and preserve every other setting.`,
      "Run `adamantite doctor` again. It must not report this finding.",
    ],
    id: "mismatched-typescript-preset",
    integration: "tsconfig",
    title: "Mismatched TypeScript preset",
  }
}

/**
 * The preset that the project's configs set up: `typescript` when a config names it or loads its
 * type resets, `tsconfig` when a config names only `tsconfig`. Doctor applies the integration to
 * the same configs.
 */
export const detectPreset = (project: Project) =>
  readConfiguredPackages(project).pipe(
    Effect.map((configured) =>
      configured.length === 0
        ? Option.none<TypeScriptPreset>()
        : Option.some<TypeScriptPreset>(
            configured.some(
              ({ presets, loadsResets }) => loadsResets || presets.includes("typescript")
            )
              ? "typescript"
              : "tsconfig"
          )
    )
  )

/**
 * Each configured package must use the selected preset. A library uses `adamantite/tsconfig`
 * whatever the selection, and the library finding covers it. Oxlint's type check runs without a
 * `tsconfig.json`. A config without `extends` cannot load the type resets, so Doctor runs
 * TypeScript only for the others.
 */
const assess = Effect.fn("assess")(function* (
  project: Project,
  preset: TypeScriptPreset,
  selection: Selection
) {
  const { cwd, packageJson } = project
  const path = yield* Path.Path
  const configured = yield* readConfiguredPackages(project)

  const missing =
    configured.length === 0
      ? [
          toMissingPresetFinding(
            preset,
            project.workspace.isMonorepo,
            yield* render(selection, preset)
          ),
        ]
      : []

  const findings = yield* Effect.forEach(
    configured,
    ({ directory, loadsResets, presets }) =>
      Effect.gen(function* () {
        const configPath = path.relative(cwd, path.join(directory, CONFIG_PATH))
        const manifest = directory === cwd ? packageJson : yield* readPackageJson(directory)

        if (checkPublishesTypes(manifest)) {
          return loadsResets ? [toLibraryFinding(configPath)] : []
        }

        const used = loadsResets || presets.includes("typescript") ? "typescript" : "tsconfig"

        return preset === used ? [] : [toMismatchedPresetFinding(configPath, preset, used)]
      }),
    { concurrency: "unbounded" }
  )

  return { findings: [...missing, ...findings.flat()], packageActions: [], warnings: [] }
})

/**
 * Whether Adamantite manages the root `tsconfig.json`. In a monorepo, a root config that extends a
 * preset makes TypeScript treat all packages as one project, so Adamantite creates none, and Doctor
 * asks for the preset in each package. A root config that Adamantite wrote before the project
 * became a monorepo stays managed, because other configs can extend it.
 */
function checkIsManaged({ lockfile, workspace }: Project) {
  return (
    !workspace.isMonorepo
    || Option.exists(lockfile, ({ written }) => Object.hasOwn(written, CONFIG_PATH))
  )
}

export default {
  assess: (project: Project, selection: Selection) =>
    selection.typescript === null
      ? Effect.succeed({ findings: [], packageActions: [], warnings: [] })
      : assess(project, selection.typescript, selection),
  files: (project: Project, selection: Selection) =>
    selection.typescript === null || !checkIsManaged(project)
      ? Effect.succeed([])
      : Effect.map(render(selection, selection.typescript), (content) => [
          { content, path: CONFIG_PATH },
        ]),
  name: "tsconfig",
  packages: (_project: Project, _selection: Selection) => [],
  prepare: (_project: Project) => Effect.void,
  selected: ({ typescript }: Selection) => typescript !== null,
} satisfies Integration
