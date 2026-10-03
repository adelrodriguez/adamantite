import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import {
  CUSTOM_RULES_MODULE,
  findCustomRulesCalls,
  findRuntimeImports,
  inspectRuleFile,
  isRuleFile,
} from "#lib/integrations/tooling/oxlint/custom-rules/inspect.ts"
import { readDirectoryIfExists, readFile, readFileIfExists } from "#lib/shared/filesystem.ts"
import { CUSTOM_RULES_DIRECTORY } from "#lib/workspace/custom-rules.ts"
import { checkIsMonorepo, getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const NAME = "custom-rules"

const CONFIG_FILES = [
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.js",
  "oxlint.config.mjs",
]

const MODULE_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]

interface WorkspacePackage {
  readonly directory: string
  readonly exports: PackageJson.Exports | undefined
  readonly main: string | undefined
  readonly name: string
}

interface SourceModule {
  readonly content: string
  readonly file: string
}

/**
 * `unresolved` is an import of a workspace package or a relative path that Doctor cannot follow.
 * Imports of other packages are `external`.
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

interface RulesFolder {
  readonly dir: string
  readonly ruleFiles: readonly string[]
}

const CONFIG_REFERENCE = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/lint/custom"

export default defineConfig({
  extends: [core, custom()],
})
`

const RUNTIME_CONDITIONS = ["import", "node", "default"]

/**
 * The file that an export target selects at runtime: the target string, or the first runtime
 * condition that selects a file.
 */
function getExportTarget(target: PackageJson.Exports | undefined): string | undefined {
  if (target === undefined || target === null) {
    return undefined
  }

  if (Predicate.isString(target)) {
    return target
  }

  if (Array.isArray(target)) {
    return target.map((entry) => getExportTarget(entry)).find((entry) => entry !== undefined)
  }

  return RUNTIME_CONDITIONS.map((condition) => getExportTarget(target[condition])).find(
    (entry) => entry !== undefined
  )
}

/**
 * The file in a workspace package that an import of `subpath` loads, relative to the package
 * directory. Follows the `exports` map, with `*` patterns, and falls back to `main` and `index` for
 * a package without one. Undefined when the package does not export the subpath.
 */
function resolvePackageTarget(workspacePackage: WorkspacePackage, subpath: string) {
  const { exports } = workspacePackage

  if (exports === undefined) {
    return subpath === "" ? (workspacePackage.main ?? "index") : subpath
  }

  const key = subpath === "" ? "." : `./${subpath}`

  if (exports === null || Predicate.isString(exports) || Array.isArray(exports)) {
    return key === "." ? getExportTarget(exports) : undefined
  }

  const subpaths = Object.keys(exports).some((name) => name.startsWith("."))
    ? exports
    : { ".": exports }

  if (key in subpaths) {
    return getExportTarget(subpaths[key])
  }

  const patternMatch = Object.entries(subpaths)
    .map(([pattern, target]) => {
      const [prefix, suffix, ...rest] = pattern.split("*")
      const matches =
        prefix !== undefined
        && suffix !== undefined
        && rest.length === 0
        && key.startsWith(prefix)
        && key.endsWith(suffix)
        && key.length >= prefix.length + suffix.length

      return matches
        ? { match: key.slice(prefix.length, key.length - suffix.length), target }
        : null
    })
    .find((candidate) => candidate !== null)

  return patternMatch === undefined
    ? undefined
    : getExportTarget(patternMatch.target)?.replaceAll("*", patternMatch.match)
}

const readWorkspacePackage = Effect.fn("readWorkspacePackage")(function* (directory: string) {
  const packageJson = yield* readPackageJson(directory)

  if (packageJson.name === undefined) {
    return Option.none<WorkspacePackage>()
  }

  return Option.some({
    directory,
    exports: packageJson.exports,
    main: packageJson.main,
    name: packageJson.name,
  } satisfies WorkspacePackage)
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
 * Resolve an import to a source file in the project: a relative path, or a workspace package and
 * its subpaths. Other packages are not followed.
 */
const resolveImport = Effect.fn("resolveImport")(function* (
  from: string,
  specifier: string,
  packages: readonly WorkspacePackage[]
) {
  const path = yield* Path.Path
  let base: string | undefined

  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    base = path.resolve(path.dirname(from), specifier)
  } else {
    const owner = packages.find(
      (workspacePackage) =>
        specifier === workspacePackage.name || specifier.startsWith(`${workspacePackage.name}/`)
    )

    if (owner === undefined) {
      return { _tag: "external" } satisfies ResolvedImport
    }

    const target = resolvePackageTarget(owner, specifier.slice(owner.name.length + 1))

    if (target === undefined) {
      return { _tag: "unresolved" } satisfies ResolvedImport
    }

    base = path.resolve(owner.directory, target)
  }

  if (base.split(path.sep).includes("node_modules")) {
    return { _tag: "external" } satisfies ResolvedImport
  }

  const directory = base
  // A TypeScript source can import a sibling with the `.js` extension of its build output.
  const stem = base.replace(/\.[cm]?js$/u, "")
  const module = yield* readFirstFile([
    base,
    ...MODULE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => path.join(directory, `index${extension}`)),
  ])

  return Option.match(module, {
    onNone: (): ResolvedImport => ({ _tag: "unresolved" }),
    onSome: (found): ResolvedImport => ({ _tag: "found", module: found }),
  })
})

/**
 * The `custom()` calls that the Oxlint configs reach: calls in each config, and in the modules that
 * a config imports, such as the entry module of a shared tooling package. A `custom()` call in a
 * module that no config imports does not load rules.
 */
const findCalls = Effect.fn("findCustomRulesCalls")(function* (
  packageDirectories: readonly string[]
) {
  const path = yield* Path.Path
  const packages = Array.getSomes(
    yield* Effect.forEach(packageDirectories, (directory) => readWorkspacePackage(directory), {
      concurrency: "unbounded",
    })
  )
  const configs = Array.getSomes(
    yield* Effect.forEach(
      packageDirectories,
      (directory) => readFirstFile(CONFIG_FILES.map((file) => path.join(directory, file))),
      { concurrency: "unbounded" }
    )
  )
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
      ({ from, specifier }) => resolveImport(from, specifier, packages),
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

  return { calls, unresolvedImports }
})

const readRulesFolder = Effect.fn("readRulesFolder")(function* (dir: string) {
  const entries = yield* readDirectoryIfExists(dir)

  return entries.pipe(
    Option.map((names): RulesFolder => ({
      dir,
      ruleFiles: names.filter((name) => isRuleFile(name)),
    }))
  )
})

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const relative = (target: string) => path.relative(cwd, target) || "."
      const packageDirectories = [
        cwd,
        ...((yield* checkIsMonorepo(cwd)) ? yield* getWorkspacePackageDirectories(cwd) : []),
      ]
      const { calls, unresolvedImports } = yield* findCalls(packageDirectories)
      const defaultFolders = packageDirectories.map((directory) =>
        path.join(directory, CUSTOM_RULES_DIRECTORY)
      )
      const loadedFolders = Array.dedupe(
        calls.flatMap((call) => (call.dir === null ? [] : [call.dir]))
      )
      const folders = Array.getSomes(
        yield* Effect.forEach(
          Array.dedupe([...defaultFolders, ...loadedFolders]),
          (dir) => readRulesFolder(dir),
          { concurrency: "unbounded" }
        )
      ).filter((folder) => folder.ruleFiles.length > 0)

      if (calls.length === 0 && folders.length === 0 && unresolvedImports.length === 0) {
        return { applicable: false, warnings: [] } satisfies IntegrationAssessment
      }

      const unresolvedCalls = calls.filter((call) => call.dir === null || call.name === null)
      const warnings = [
        ...unresolvedImports.map(
          ({ from, specifier }) =>
            `Doctor cannot resolve the import of \`${specifier}\` in \`${relative(from)}\`, so it does not check the \`custom()\` calls and rules folders behind it.`
        ),
        ...unresolvedCalls.map(
          (call) =>
            `Doctor cannot read the \`dir\` or \`name\` of a \`custom()\` call in \`${relative(call.source)}\`, because it is not a string literal. Doctor does not check that rules folder.`
        ),
      ]
      const findings: Finding[] = []

      // An unresolved call or import can load any folder, so an unloaded folder is reported only
      // when every call and import is resolved.
      if (unresolvedCalls.length === 0 && unresolvedImports.length === 0) {
        for (const folder of folders) {
          if (loadedFolders.includes(folder.dir)) {
            continue
          }

          findings.push({
            currentState: `\`${relative(folder.dir)}\` has ${folder.ruleFiles.length} rule file(s), but no \`custom()\` call loads it, so Oxlint does not run them.`,
            goal: [
              `Load \`${relative(folder.dir)}\` with \`custom()\` from \`adamantite/lint/custom\` in the Oxlint config of \`${relative(path.dirname(path.dirname(folder.dir)))}\`. A relative \`dir\` resolves from the file that calls \`custom()\`.`,
              "Give each rules folder its own plugin name with the `name` option, because Oxlint rejects two plugins with the same name in one run.",
              "Preserve every other setting in the Oxlint config.",
            ],
            id: `custom-rules-not-loaded:${relative(folder.dir)}`,
            integration: NAME,
            reference: { content: CONFIG_REFERENCE, language: "ts" },
            title: `Custom rules in \`${relative(folder.dir)}\` are not loaded`,
          })
        }
      }

      for (const folder of folders) {
        for (const file of folder.ruleFiles) {
          const rulePath = path.join(folder.dir, file)
          const problems = inspectRuleFile(rulePath, yield* readFile(rulePath))

          if (problems.length === 0) {
            continue
          }

          findings.push({
            currentState: `\`${relative(rulePath)}\` cannot load as a rule, so the whole lint run fails with "Failed to parse oxlint configuration file":\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
            goal: [
              "The file parses, uses only TypeScript that type stripping can erase (no `enum`, `namespace` with values, parameter properties, or `import x = require()`), and exports the rule as default.",
              "Keep the behavior of the rule.",
            ],
            id: `custom-rule-cannot-load:${relative(rulePath)}`,
            integration: NAME,
            notes: [
              "A file that starts with `_` is a helper, not a rule. Rename a helper file so that it starts with `_`.",
            ],
            title: `Custom rule \`${relative(rulePath)}\` cannot load`,
          })
        }
      }

      const loadingCalls = calls.filter(
        (call) =>
          call.dir !== null
          && folders.some((folder) => folder.dir === call.dir)
          && call.name !== null
      )

      for (const [name, group] of Object.entries(
        Array.groupBy(loadingCalls, (call) => call.name ?? "")
      )) {
        const dirs = Array.dedupe(group.map((call) => call.dir ?? ""))

        if (dirs.length < 2) {
          continue
        }

        findings.push({
          currentState: `${dirs.length} rules folders use the plugin name \`${name}\`: ${dirs.map((dir) => `\`${relative(dir)}\``).join(", ")}. Oxlint rejects two plugins with the same name in one run.`,
          goal: [
            `Each \`custom()\` call that loads one of these folders passes a \`name\` that no other rules folder uses, such as \`custom({ name: "web" })\`. The calls are in ${Array.dedupe(group.map((call) => `\`${relative(call.source)}\``)).join(", ")}.`,
            "Rule names in `oxlint-disable` comments and `rules` settings use the new plugin name.",
          ],
          id: `custom-rules-duplicate-name:${name}`,
          integration: NAME,
          title: `Rules folders share the plugin name \`${name}\``,
        })
      }

      return {
        applicable: true,
        findings,
        packageActions: [],
        warnings,
      } satisfies IntegrationAssessment
    }),
  kind: "tooling",
  name: NAME,
})
