import type * as Result from "effect/Result"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { ConfigLoadFailed } from "#lib/shared/errors.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

/**
 * The JSON key under which `encodeConfig` writes the identity that an Adamantite preset or a
 * `custom()` result holds under `PRESET` of `presets/identity.ts`.
 */
export const IDENTITY_KEY = "$adamantite"

/**
 * The identity of an Adamantite preset in a loaded config: its public module, such as
 * `adamantite/lint/strict`.
 */
export const PresetIdentity = Schema.Struct({ module: Schema.String })

/**
 * The identity of a `custom()` result in a loaded config: the rules folder, the plugin name, and
 * the file that called `custom()`, when its stack names one.
 */
export const RulesFolderIdentity = Schema.Struct({
  caller: Schema.optional(Schema.String),
  dir: Schema.String,
  module: Schema.Literal("adamantite/rules"),
  name: Schema.String,
})

export type RulesFolderIdentity = typeof RulesFolderIdentity.Type

/**
 * The source of `encode(module)`, which returns the JSON of the default export of a loaded config
 * module. An object that holds an Adamantite identity under the `adamantite.preset` symbol gets it
 * under `IDENTITY_KEY`, because JSON drops symbol keys. A regular expression, which Knip accepts in
 * place of a name, becomes `{ $regexp, flags }`. The child process runs it, and so does the
 * in-memory loader of the unit tests.
 */
export const ENCODE_SOURCE = [
  "function encode(module) {",
  '  const identity = Symbol.for("adamantite.preset")',
  "  return JSON.stringify({ value: module.default }, (_key, value) => {",
  "    if (value instanceof RegExp) {",
  "      return { $regexp: value.source, flags: value.flags }",
  "    }",
  "    if (!(value instanceof Object) || !Object.hasOwn(value, identity)) {",
  "      return value",
  "    }",
  `    return { ...value, ${JSON.stringify(IDENTITY_KEY)}: value[identity] }`,
  "  })",
  "}",
].join("\n")

// The line that comes before the result, so that output from the config itself stays apart.
const RESULT_MARKER = "\u0000adamantite-config\u0000"

// The module that the child process evaluates. Node.js imports the config as Oxlint does, with type
// stripping for a TypeScript config, and prints the default export.
const LOAD_SCRIPT = [
  ENCODE_SOURCE,
  'const { pathToFileURL } = await import("node:url")',
  "let output",
  "try {",
  "  const module = await import(pathToFileURL(process.argv[1]).href)",
  "  output = encode(module)",
  "} catch (error) {",
  "  output = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })",
  "}",
  `process.stdout.write(${JSON.stringify(RESULT_MARKER)} + output)`,
].join("\n")

const LoadResult = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({ error: Schema.String }),
    Schema.Struct({ value: Schema.optional(Schema.Unknown) }),
  ])
)

const decodeLoadResult = Schema.decodeUnknownOption(LoadResult)

/**
 * Loads the configs of a target project as the tools do: Node.js imports the module, and the
 * default export is the config.
 */
export class ConfigLoader extends Context.Service<
  ConfigLoader,
  {
    /**
     * The default export of the module at `file`, as `ENCODE_SOURCE` writes it, decoded from JSON.
     * The module runs in `cwd`, the folder that `adamantite check` starts Oxlint in, so a config
     * that reads a file through `process.cwd()` reads the file that the tool reads. Fails when the
     * module does not load or has no default export.
     */
    readonly load: (cwd: string, file: string) => Effect.Effect<unknown, ConfigLoadFailed>
  }
>()("ConfigLoader") {
  // A config runs project code, as it does when Oxlint imports it. Each load runs in its own Node.js
  // process, so output of the config cannot reach the output of a command, and a later load reads
  // the files again, after a coding agent changes a module that the config imports.
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      return {
        load: Effect.fn("ConfigLoader.load")(
          function* (cwd: string, file: string) {
            const handle = yield* spawner.spawn(
              // `custom()` writes the entry module of a rules folder outside the project when the
              // arguments include `--debug=files`, as in Oxlint's read-only file listing, so a load
              // changes no file of the project.
              ChildProcess.make(
                "node",
                ["--input-type=module", "--eval", LOAD_SCRIPT, file, "--debug=files"],
                {
                  cwd,
                  extendEnv: true,
                  stdin: "ignore",
                }
              )
            )

            const [stdout, stderr] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ],
              { concurrency: "unbounded" }
            )

            const start = stdout.lastIndexOf(RESULT_MARKER)

            const result =
              start === -1
                ? Option.none()
                : decodeLoadResult(stdout.slice(start + RESULT_MARKER.length))

            if (Option.isNone(result)) {
              return yield* new ConfigLoadFailed({
                file,
                reason: stderr.trim() || "The config stopped Node.js before it exported a value.",
              })
            }

            if ("error" in result.value) {
              return yield* new ConfigLoadFailed({ file, reason: result.value.error })
            }

            if (result.value.value === undefined) {
              return yield* new ConfigLoadFailed({
                file,
                reason: "The module has no default export.",
              })
            }

            return result.value.value
          },
          Effect.scoped,
          (effect, _cwd, file) =>
            effect.pipe(
              Effect.catchTag("PlatformError", (error) =>
                Effect.fail(new ConfigLoadFailed({ file, reason: error.message }))
              )
            )
        ),
      }
    })
  )
}

/**
 * The config at `file`, loaded in `cwd` and decoded with `schema`, or none when the file does not
 * exist. A config that does not load, or does not fit `schema`, is a failed `Result`, because a
 * finding reports it.
 */
export const readConfig = Effect.fn("readConfig")(function* <A>(
  cwd: string,
  file: string,
  schema: Schema.Decoder<A>
) {
  const loader = yield* ConfigLoader
  const exists = yield* checkExists(file)

  if (!exists) {
    return Option.none<Result.Result<A, ConfigLoadFailed>>()
  }

  return yield* loader.load(cwd, file).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(schema)(value).pipe(
        Effect.mapError((error) => new ConfigLoadFailed({ file, reason: error.message }))
      )
    ),
    Effect.result,
    Effect.asSome
  )
})
