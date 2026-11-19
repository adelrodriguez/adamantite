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

export const IDENTITY_KEY = "$adamantite"

export const PresetIdentity = Schema.Struct({ module: Schema.String })

export const RulesFolderIdentity = Schema.Struct({
  caller: Schema.optional(Schema.String),
  dir: Schema.String,
  module: Schema.Literal("adamantite/rules"),
  name: Schema.String,
})

export type RulesFolderIdentity = typeof RulesFolderIdentity.Type

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

const RESULT_MARKER = "\u0000adamantite-config\u0000"

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

export class ConfigLoader extends Context.Service<
  ConfigLoader,
  {
    readonly load: (cwd: string, file: string) => Effect.Effect<unknown, ConfigLoadFailed>
  }
>()("ConfigLoader") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      return {
        load: Effect.fn("ConfigLoader.load")(
          function* (cwd: string, file: string) {
            const handle = yield* spawner.spawn(
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
