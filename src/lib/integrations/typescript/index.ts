import type { JsonValue, PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as Jsonc from "effect/encoding/Jsonc"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import { LANGUAGE_SERVICE_PLUGIN } from "#lib/integrations/effect-language-service.ts"
import * as Project from "#lib/project/index.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import {
  type Selection,
  TYPESCRIPT_PRESET_NAMES,
  type TypeScriptPreset,
} from "#lib/project/selection.ts"
import { readFile } from "#lib/shared/filesystem.ts"
import { formatJson } from "#lib/shared/json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const CONFIG_PATH = "tsconfig.json"

const TYPESCRIPT_PRESETS = {
  tsconfig: publicImport("./tsconfig"),
  typescript: publicImport("./typescript"),
} as const satisfies Record<TypeScriptPreset, string>

const RESETS_FILE = "/dist/presets/typescript/resets/index.d.ts"

const ShowConfig = Schema.Struct({ files: Schema.optional(Schema.Array(Schema.String)) })
const decodeShowConfig = Schema.decodeUnknownOption(ShowConfig)

// `tsc --showConfig` prints the files that the project's TypeScript resolves. TypeScript follows
// `extends` by its own rules, and a config that sets its own `files` drops the resets.
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

function readExtends(config: JsonValue) {
  if (!Predicate.isObject(config)) {
    return []
  }

  return (Array.isArray(config.extends) ? config.extends : [config.extends]).filter(
    Predicate.isString
  )
}

const ADAMANTITE_PRESETS: readonly string[] = Object.values(TYPESCRIPT_PRESETS)

// TypeScript resolves an `extends` entry that is not a relative or absolute path as a package.
function checkIsPath(path: Path.Path, entry: string) {
  return entry.startsWith("./") || entry.startsWith("../") || path.isAbsolute(entry)
}

// TypeScript reads a base config only when its path is a file.
const checkIsFile = (file: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.stat(file)),
    Effect.map(({ type }) => type === "File"),
    Effect.orElseSucceed(() => false)
  )

// TypeScript adds `.json` to a path entry that is not a file and does not end in `.json`. It
// reports a base config that it cannot load, so Doctor reads such a base as one that names no
// preset.
const readExtendsChain = (
  file: string,
  visited: ReadonlySet<string> = new Set()
): Effect.Effect<readonly string[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path

    const text =
      visited.has(file) || !(yield* checkIsFile(file))
        ? Option.none<string>()
        : yield* Effect.option(readFile(file))

    const entries: readonly string[] = Option.match(
      Option.flatMap(text, (value) =>
        Result.getSuccess(
          Json5.parse(value).pipe(Result.flatMap(Schema.decodeUnknownResult(Schema.Json)))
        )
      ),
      { onNone: () => [], onSome: readExtends }
    )

    const bases = yield* Effect.forEach(
      entries.filter((entry) => checkIsPath(path, entry)),
      (entry) =>
        Effect.gen(function* () {
          const named = path.resolve(path.dirname(file), entry)

          return yield* readExtendsChain(
            named.endsWith(".json") || (yield* checkIsFile(named)) ? named : `${named}.json`,
            new Set([...visited, file])
          )
        }),
      { concurrency: "unbounded" }
    )

    return [...entries, ...bases.flat()]
  })

type Chain =
  | { readonly _tag: "NoPreset" }
  | { readonly _tag: "Preset"; readonly preset: TypeScriptPreset }
  | { readonly _tag: "UnknownBase"; readonly entry: string }

const { $is: isChain, NoPreset, Preset, UnknownBase } = Data.taggedEnum<Chain>()

function toChain(path: Path.Path, entries: readonly string[]): Chain {
  const packages = entries.filter((entry) => !checkIsPath(path, entry))
  const unknown = packages.find((entry) => !ADAMANTITE_PRESETS.includes(entry))

  if (unknown !== undefined) {
    return UnknownBase({ entry: unknown })
  }

  const preset = TYPESCRIPT_PRESET_NAMES.find((name) => packages.includes(TYPESCRIPT_PRESETS[name]))

  return preset === undefined ? NoPreset() : Preset({ preset })
}

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

const readConfiguredPackages = Effect.fn("readConfiguredPackages")(function* ({
  workspace,
}: Project.Snapshot) {
  const cwd = yield* Project.Directory
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

        const chain = toChain(path, entries)

        return isChain("NoPreset")(chain) && !loadsResets ? [] : [{ chain, directory, loadsResets }]
      }),
    { concurrency: 4 }
  )

  return packages.flat()
})

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

const assess = Effect.fn("assess")(function* (
  project: Project.Snapshot,
  preset: TypeScriptPreset,
  selection: Selection
) {
  const cwd = yield* Project.Directory
  const { packageJson } = project
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
    ({ chain, directory, loadsResets }) =>
      Effect.gen(function* () {
        const configPath = path.relative(cwd, path.join(directory, CONFIG_PATH))
        const manifest = directory === cwd ? packageJson : yield* readPackageJson(directory)

        if (checkPublishesTypes(manifest)) {
          return loadsResets ? [toLibraryFinding(configPath)] : []
        }

        if (isChain("UnknownBase")(chain)) {
          return []
        }

        const used =
          loadsResets || (isChain("Preset")(chain) && chain.preset === "typescript")
            ? "typescript"
            : "tsconfig"

        return preset === used ? [] : [toMismatchedPresetFinding(configPath, preset, used)]
      }),
    { concurrency: "unbounded" }
  )

  return { findings: [...missing, ...findings.flat()], packageActions: [], warnings: [] }
})

function checkIsManaged({ lockfile, workspace }: Project.Snapshot) {
  return (
    !workspace.isMonorepo
    || Option.exists(lockfile, ({ written }) => Object.hasOwn(written, CONFIG_PATH))
  )
}

export default {
  assess: (project: Project.Snapshot, selection: Selection) =>
    selection.typescript === null
      ? Effect.succeed({ findings: [], packageActions: [], warnings: [] })
      : assess(project, selection.typescript, selection),
  files: (project: Project.Snapshot, selection: Selection) =>
    selection.typescript === null || !checkIsManaged(project)
      ? Effect.succeed([])
      : Effect.map(render(selection, selection.typescript), (content) => [
          { content, path: CONFIG_PATH },
        ]),
  name: "tsconfig",
  packages: (_project: Project.Snapshot, _selection: Selection) => [],
  selected: ({ typescript }: Selection) => typescript !== null,
} satisfies Integration
