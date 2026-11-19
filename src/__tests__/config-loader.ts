import { Buffer } from "node:buffer"
import { stripTypeScriptTypes } from "node:module"
import { join } from "node:path"
import { dirname } from "node:path/posix"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { ConfigLoader, ENCODE_SOURCE } from "#lib/project/config-loader.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { ConfigLoadFailed } from "#lib/shared/errors.ts"
import packageJson from "../../package.json" with { type: "json" }

const REPO_ROOT = join(import.meta.dirname, "../..")

const PRESET_SOURCES = new Map<string, string>(
  Object.entries(packageJson.exports).flatMap(([subpath, target]) => {
    const built = Predicate.isString(target) ? target : target.default
    const source = /^\.\/dist\/(presets\/.+)\.js$/u.exec(built)?.[1]

    return source === undefined
      ? []
      : [[`adamantite${subpath.slice(1)}`, join(REPO_ROOT, `${source}.ts`)] as const]
  })
)

const ConfigModule = Schema.Struct({ default: Schema.optional(Schema.Unknown) })

const decodeModule = Schema.decodeUnknownEffect(ConfigModule)

const decodeEncoder = Schema.decodeUnknownEffect(
  Schema.Struct({
    encode: Schema.declare((input): input is (module: typeof ConfigModule.Type) => string =>
      Predicate.isFunction(input)
    ),
  })
)

const decodeEncoded = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ value: Schema.optional(Schema.Unknown) }))
)

const SPECIFIER =
  /(?<prefix>\bfrom\s*|\bimport\s*\(?\s*)(?<quote>["'])(?<specifier>[^"']+)\k<quote>/gu

function toDataUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
}

function makeCustomModule(file: string) {
  return toDataUrl(
    [
      'import { dirname, isAbsolute, resolve } from "node:path"',
      `const caller = ${JSON.stringify(file)}`,
      "export default function custom(options = {}) {",
      '  const dir = options.dir ?? ".adamantite/lint"',
      "  return {",
      '    [Symbol.for("adamantite.preset")]: {',
      "      caller,",
      "      dir: isAbsolute(dir) ? dir : resolve(dirname(caller), dir),",
      '      module: "adamantite/rules",',
      '      name: options.name ?? "project",',
      "    },",
      "  }",
      "}",
    ].join("\n")
  )
}

export const configLoaderLayer = Layer.effect(
  ConfigLoader,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const resolver = yield* ModuleResolver

    const { encode } = yield* Effect.promise(
      () => import(toDataUrl(`export ${ENCODE_SOURCE}`))
    ).pipe(Effect.flatMap(decodeEncoder))

    const evaluate = (file: string): Effect.Effect<string, ConfigLoadFailed> =>
      Effect.gen(function* () {
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError((error) => new ConfigLoadFailed({ file, reason: error.message })))

        const specifiers = [...content.matchAll(SPECIFIER)].flatMap(
          (match) => match.groups?.["specifier"] ?? []
        )

        const urls = new Map(
          yield* Effect.forEach(
            specifiers,
            (specifier) =>
              Effect.gen(function* () {
                if (specifier === "adamantite/rules") {
                  return [specifier, makeCustomModule(file)] as const
                }

                const preset = PRESET_SOURCES.get(specifier)

                if (preset !== undefined) {
                  return [specifier, pathToFileURL(preset).href] as const
                }

                const resolved = yield* resolver.resolve(dirname(file), specifier)

                return Option.isSome(resolved)
                  ? ([specifier, yield* evaluate(resolved.value)] as const)
                  : ([
                      specifier,
                      yield* Effect.try({
                        catch: (cause) =>
                          new ConfigLoadFailed({
                            file,
                            reason: Predicate.isError(cause) ? cause.message : String(cause),
                          }),
                        try: () => import.meta.resolve(specifier),
                      }),
                    ] as const)
              }),
            { concurrency: 1 }
          )
        )

        const source = content.replaceAll(
          SPECIFIER,
          (_match, prefix: string, quote: string, specifier: string) =>
            `${prefix}${quote}${urls.get(specifier) ?? specifier}${quote}`
        )

        return toDataUrl(
          yield* Effect.try({
            catch: (cause) =>
              new ConfigLoadFailed({
                file,
                reason: Predicate.isError(cause) ? cause.message : String(cause),
              }),
            try: () => stripTypeScriptTypes(source),
          })
        )
      })

    return {
      load: (_cwd: string, file: string) =>
        evaluate(file).pipe(
          Effect.flatMap((url) =>
            Effect.tryPromise({
              catch: (cause) =>
                new ConfigLoadFailed({
                  file,
                  reason: Predicate.isError(cause) ? cause.message : String(cause),
                }),
              try: () => import(url),
            })
          ),
          Effect.flatMap((module) =>
            decodeModule(module).pipe(
              Effect.flatMap((decoded) => decodeEncoded(encode(decoded))),
              Effect.mapError((error) => new ConfigLoadFailed({ file, reason: error.message }))
            )
          ),
          Effect.flatMap(({ value }) =>
            value === undefined
              ? Effect.fail(
                  new ConfigLoadFailed({ file, reason: "The module has no default export." })
                )
              : Effect.succeed(value)
          )
        ),
    }
  })
)

export function withConfigLoader<ROut, E, RIn>(
  layer: Layer.Layer<ROut | FileSystem.FileSystem | ModuleResolver, E, RIn>
) {
  return Layer.provideMerge(configLoaderLayer, layer)
}
