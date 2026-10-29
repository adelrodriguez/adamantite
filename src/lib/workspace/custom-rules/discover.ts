import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import {
  CUSTOM_RULES_MODULE,
  findCustomRulesCalls,
  findRuntimeImports,
} from "#lib/workspace/custom-rules/inspect.ts"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const CONFIG_FILES = [
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
type ResolvedImport =
  | { readonly _tag: "external" }
  | { readonly _tag: "found"; readonly module: SourceModule }
  | { readonly _tag: "unresolved" }

interface ResolvedCall {
  /**
   * Absolute rules folder, or `null` when only running the config can resolve it.
   */
  readonly dir: string | null
  readonly name: string | null
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
  for (const candidate of candidates) {
    const content = yield* readFileIfExists(candidate).pipe(
      // A directory cannot be read as a file.
      Effect.orElseSucceed(() => Option.none<string>())
    )

    if (Option.isSome(content)) {
      return Option.some({ content: content.value, file: candidate })
    }
  }

  return Option.none<SourceModule>()
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
  const file = yield* resolver.resolve(from, specifier)

  if (Option.isNone(file)) {
    return local
      ? ({ _tag: "unresolved" } satisfies ResolvedImport)
      : ({ _tag: "external" } satisfies ResolvedImport)
  }

  if (file.value.split(path.sep).includes("node_modules")) {
    return { _tag: "external" } satisfies ResolvedImport
  }

  const module = yield* readFirstFile([file.value])

  return Option.match(module, {
    onNone: (): ResolvedImport => ({ _tag: "unresolved" }),
    onSome: (found): ResolvedImport => ({ _tag: "found", module: found }),
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
  const packageNames = new Set(
    Array.getSomes(
      yield* Effect.forEach(packageDirectories, (directory) => readPackageName(directory), {
        concurrency: "unbounded",
      })
    )
  )
  const packageConfigs = Array.getSomes(
    yield* Effect.forEach(
      packageDirectories,
      (directory) => readFirstFile(CONFIG_FILES.map((file) => path.join(directory, file))),
      { concurrency: "unbounded" }
    )
  )
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
  const calls: ResolvedCall[] = []
  const unresolvedImports: Array<{ readonly from: string; readonly specifier: string }> = []
  let queue = configs

  while (queue.length > 0) {
    const modules = queue.filter((module) => !visited.has(module.file))

    for (const module of modules) {
      visited.add(module.file)

      if (module.content.includes(CUSTOM_RULES_MODULE)) {
        calls.push(
          ...findCustomRulesCalls(module.file, module.content).map((call): ResolvedCall => ({
            dir: call.dir === null ? null : path.resolve(path.dirname(module.file), call.dir),
            name: call.name,
            source: module.file,
          }))
        )
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

      if (result._tag === "found") {
        queue.push(result.module)
      } else if (result._tag === "unresolved" && source !== undefined) {
        unresolvedImports.push(source)
      }
    }
  }

  return { calls, configs: configs.map((config) => config.file), unresolvedImports }
})
