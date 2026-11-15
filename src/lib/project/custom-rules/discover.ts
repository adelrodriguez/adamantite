import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { listRulesFolders, readLintConfig } from "#lib/project/lint-config.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

export const CONFIG_FILES = [
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.js",
  "oxlint.config.mjs",
]

/**
 * A `custom()` call that a loaded config reaches.
 */
interface ResolvedCall {
  /**
   * Absolute rules folder.
   */
  readonly dir: string
  readonly name: string
  /**
   * The file that called `custom()`, or the config when the stack of the call names no file.
   */
  readonly source: string
}

/**
 * The first config file that exists in `directory`.
 */
const findConfigFile = Effect.fn("findConfigFile")(function* (directory: string) {
  const path = yield* Path.Path

  const found = yield* Effect.filter(
    CONFIG_FILES.map((file) => path.join(directory, file)),
    (file) => checkExists(file),
    { concurrency: "unbounded" }
  )

  return Array.head(found)
})

/**
 * The Oxlint configs that lint the `lintedDirectories`, and the `custom()` calls that the configs
 * reach. Each config loads as Oxlint loads it, so a call in a module that the config imports, such
 * as the entry module of a shared tooling package, counts, and a call in a module that no config
 * imports does not. As in Oxlint, a directory uses the config of the innermost package that
 * contains it and has one. A config that loads is in `loadedConfigs`, and a config that does not
 * load is in `unloadedConfigs`, with the reason. Every config loads in `cwd`, the project root that
 * `adamantite check` starts Oxlint in.
 */
export const discoverCustomRules = Effect.fn("discoverCustomRules")(function* (
  cwd: string,
  packageDirectories: readonly string[],
  lintedDirectories: readonly string[] = packageDirectories
) {
  const path = yield* Path.Path

  const packageConfigs = Array.getSomes(
    yield* Effect.forEach(packageDirectories, (directory) => findConfigFile(directory), {
      concurrency: "unbounded",
    })
  )

  const nearestConfigs = new Set(
    lintedDirectories.flatMap((directory) =>
      Array.sort(
        packageConfigs.filter((config) => {
          const configDirectory = path.dirname(config)

          return directory === configDirectory || directory.startsWith(configDirectory + path.sep)
        }),
        Order.mapInput(Order.flip(Order.Number), (config: string) => path.dirname(config).length)
      ).slice(0, 1)
    )
  )

  const configs = packageConfigs.filter((config) => nearestConfigs.has(config))

  const loaded = yield* Effect.forEach(
    configs,
    (config) =>
      readLintConfig(cwd, config).pipe(
        Effect.map((read) => ({ config, read: Option.getOrUndefined(read) }))
      ),
    { concurrency: "unbounded" }
  )

  return {
    calls: loaded.flatMap(({ config, read }) =>
      read !== undefined && Result.isSuccess(read)
        ? listRulesFolders(read.success).map(({ caller, dir, name }): ResolvedCall => ({
            dir,
            name,
            source: caller ?? config,
          }))
        : []
    ),
    configs,
    loadedConfigs: loaded.flatMap(({ read }) =>
      read !== undefined && Result.isSuccess(read) ? [read.success] : []
    ),
    unloadedConfigs: loaded.flatMap(({ config, read }) =>
      read !== undefined && Result.isFailure(read)
        ? [{ file: config, reason: read.failure.reason }]
        : []
    ),
  }
})

export type CustomRuleDiscovery = Effect.Success<ReturnType<typeof discoverCustomRules>>
