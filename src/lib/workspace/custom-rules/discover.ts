import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { readFileIfFile } from "#lib/shared/filesystem.ts"
import {
  CUSTOM_RULES_MODULE,
  DynamicCustomRulesCall,
  findCustomRulesCalls,
  findRuntimeImports,
  hasLegacyRuleImports,
} from "#lib/workspace/custom-rules/inspect.ts"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

export const CONFIG_FILES = [
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.js",
  "oxlint.config.mjs",
]

interface SourceModule {
  readonly content: string
  readonly file: string
}

/**
 * `unresolved` is an import of a relative path, a `#` subpath, or a workspace package that Doctor
 * cannot follow. Imports of other packages are `external`.
 */
class ExternalImport extends Data.TaggedClass("external") {}

class FoundImport extends Data.TaggedClass("found")<{ readonly module: SourceModule }> {}

class UnresolvedImport extends Data.TaggedClass("unresolved") {}

/**
 * A `custom()` call whose rules folder Doctor can read. A call whose `dir` only running the config
 * can resolve is in `unresolvedCalls` instead.
 */
interface ResolvedCall {
  /**
   * Absolute rules folder.
   */
  readonly dir: string
  /**
   * The plugin name, or none when only running the config can resolve it.
   */
  readonly name: Option.Option<string>
  readonly source: string
}

const readPackageName = Effect.fn("readPackageName")(function* (directory: string) {
  const packageJson = yield* readPackageJson(directory)

  return Option.fromUndefinedOr(packageJson.name)
})

/**
 * The first candidate file that exists, with its content.
 */
const readFirstFile = Effect.fn("readFirstFile")(function* (candidates: readonly string[]) {
  const modules = yield* Effect.forEach(
    candidates,
    (candidate) =>
      // A candidate can be a folder, such as an import of a directory.
      readFileIfFile(candidate).pipe(
        Effect.map((content: Option.Option<string>) =>
          pipe(
            content,
            Option.map((value): SourceModule => ({ content: value, file: candidate }))
          )
        )
      ),
    { concurrency: "unbounded" }
  )

  return Array.head(Array.getSomes(modules))
})

/**
 * Resolve an import to a source file in the project. Imports that resolve into `node_modules`, and
 * imports of other packages that do not resolve, are not followed.
 */
const resolveImport = Effect.fn("resolveImport")(function* (
  from: string,
  specifier: string,
  packageNames: ReadonlySet<string>
) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver

  const local =
    specifier.startsWith(".")
    || specifier.startsWith("#")
    || path.isAbsolute(specifier)
    || [...packageNames].some((name) => specifier === name || specifier.startsWith(`${name}/`))

  const file = yield* resolver.resolve(path.dirname(from), specifier)

  if (Option.isNone(file)) {
    return local ? new UnresolvedImport() : new ExternalImport()
  }

  if (file.value.split(path.sep).includes("node_modules")) {
    return new ExternalImport()
  }

  const module = yield* readFirstFile([file.value])

  return Option.match(module, {
    onNone: () => new UnresolvedImport(),
    onSome: (found) => new FoundImport({ module: found }),
  })
})

/**
 * The Oxlint configs that lint the `lintedDirectories`, and the `custom()` calls that the configs
 * reach: calls in each config, and in the modules that a config imports, such as the entry module
 * of a shared tooling package. A `custom()` call in a module that no config imports does not load
 * rules. As in Oxlint, a directory uses the config of the innermost package that contains it and
 * has one. Imports resolve against all `packageDirectories`, so the linted directories can be a
 * subset.
 */
export const discoverCustomRules = Effect.fn("discoverCustomRules")(function* (
  packageDirectories: readonly string[],
  lintedDirectories: readonly string[] = packageDirectories
) {
  const path = yield* Path.Path

  // Doctor and harden traverse again after a coding agent changes the project.
  yield* (yield* ModuleResolver).clearCache

  const [names, configsByPackage] = yield* Effect.all(
    [
      Effect.forEach(packageDirectories, (directory) => readPackageName(directory), {
        concurrency: "unbounded",
      }),
      Effect.forEach(
        packageDirectories,
        (directory) => readFirstFile(CONFIG_FILES.map((file) => path.join(directory, file))),
        { concurrency: "unbounded" }
      ),
    ],
    { concurrency: "unbounded" }
  )

  const packageNames = new Set(Array.getSomes(names))
  const packageConfigs = Array.getSomes(configsByPackage)

  const nearestConfigs = new Set(
    lintedDirectories.flatMap((directory) =>
      Array.sort(
        packageConfigs.filter((config) => {
          const configDirectory = path.dirname(config.file)

          return directory === configDirectory || directory.startsWith(configDirectory + path.sep)
        }),
        Order.mapInput(
          Order.flip(Order.Number),
          (config: SourceModule) => path.dirname(config.file).length
        )
      ).slice(0, 1)
    )
  )

  const configs = packageConfigs.filter((config) => nearestConfigs.has(config))
  const visited = new Set<string>()
  const sources = new Map<string, SourceModule>()

  const resolvedImports: Array<{
    readonly from: string
    readonly specifier: string
    readonly file: string
  }> = []

  const calls: ResolvedCall[] = []
  const legacyImports: string[] = []
  // The module of each call whose `dir` is not a string literal, once for each call.
  const unresolvedCalls: string[] = []
  const unresolvedImports: Array<{ readonly from: string; readonly specifier: string }> = []
  let queue = configs

  while (queue.length > 0) {
    const modules = queue.filter((module) => !visited.has(module.file))

    for (const module of modules) {
      visited.add(module.file)
      sources.set(module.file, module)

      if (hasLegacyRuleImports(module.file, module.content)) {
        legacyImports.push(module.file)
      }

      if (module.content.includes(CUSTOM_RULES_MODULE)) {
        for (const call of findCustomRulesCalls(module.file, module.content)) {
          if (call instanceof DynamicCustomRulesCall) {
            unresolvedCalls.push(module.file)
          } else {
            calls.push({
              dir: path.resolve(path.dirname(module.file), call.dir),
              name: call.name,
              source: module.file,
            })
          }
        }
      }
    }

    const imports = modules.flatMap((module) =>
      findRuntimeImports(module.file, module.content).map((specifier) => ({
        from: module.file,
        specifier,
      }))
    )

    const resolved = yield* Effect.forEach(
      imports,
      ({ from, specifier }) => resolveImport(from, specifier, packageNames),
      { concurrency: "unbounded" }
    )

    queue = []

    for (const [index, result] of resolved.entries()) {
      const source = imports[index]

      if (result instanceof FoundImport && source !== undefined) {
        resolvedImports.push({ ...source, file: result.module.file })
        queue.push(result.module)
      } else if (result instanceof UnresolvedImport && source !== undefined) {
        unresolvedImports.push(source)
      }
    }
  }

  return {
    calls,
    configs: configs.map((config) => config.file),
    legacyImports,
    resolvedImports,
    sources: [...sources.values()],
    unresolvedCalls,
    unresolvedImports,
  }
})

export type CustomRuleDiscovery = Effect.Success<ReturnType<typeof discoverCustomRules>>

/**
 * Whether discovery followed every `custom()` call and import. An incomplete discovery can miss a
 * rules folder that the config loads.
 */
export function isDiscoveryComplete(
  discovery: Pick<CustomRuleDiscovery, "unresolvedCalls" | "unresolvedImports">
) {
  return discovery.unresolvedCalls.length === 0 && discovery.unresolvedImports.length === 0
}
