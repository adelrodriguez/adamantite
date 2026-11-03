import type * as Schema from "effect/Schema"
import { posix, win32 } from "node:path"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  isReportOf,
  lintFiles,
  listBuiltInRules,
  listLintedFiles,
  splitRuleName,
} from "#lib/hardening/oxlint.ts"
import { listProjectFiles } from "#lib/hardening/project-files.ts"
import {
  type CliNotFound,
  FailedToWriteFile,
  InvalidTrialCase,
  TrialCaseIgnored,
  TrialCaseUnparsable,
  TrialConfigNotFound,
  type TrialLintFailed,
  TrialProjectUnlisted,
  TrialRuleNotFound,
} from "#lib/shared/errors.ts"
import { readDirectoryIfExists, readFile, writeFile } from "#lib/shared/filesystem.ts"
import { CONFIG_FILES } from "#lib/workspace/custom-rules/discover.ts"
import { getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

/**
 * What a case must get from the rule: a report, because it has the mistake, or no report, because
 * it is correct code.
 */
export type TrialExpectation = "accepted" | "reported"

/**
 * A file that a trial lints.
 */
export interface TrialCase {
  readonly expected: TrialExpectation
  /**
   * The path of the case in the project, relative to the project root, with `/` between folders.
   */
  readonly path: string
  /**
   * The file whose content the trial puts at `path`, relative to the project root or absolute, or
   * none to lint the project file as it is.
   */
  readonly source: Option.Option<string>
}

/**
 * How a trial sets the rule: as the project config sets it now, or at `error` with the options that
 * come after the severity.
 */
export type TrialSetting =
  | { readonly _tag: "Current" }
  | { readonly _tag: "Error"; readonly options: readonly Schema.Json[] }

export interface TrialDiagnostic {
  readonly column: number
  readonly line: number
  readonly message: string
}

export interface TrialCaseResult {
  readonly case: TrialCase
  /**
   * The Oxlint config that lints the case, relative to the project root.
   */
  readonly config: string
  /**
   * The reports of the rule on the case.
   */
  readonly diagnostics: readonly TrialDiagnostic[]
}

/**
 * The file name that a trial gives the config that lints the cases, in the copy. The trial config
 * takes the name of that config, so Oxlint finds it in the same way, and it imports the config
 * under this name.
 */
const BASE_CONFIG_NAME = "oxlint.trial-base.config"

/**
 * Parses a case of `rule try`: a project path, or `<path>=<file>` to lint the content of `<file>`
 * at `<path>`. The path must stay inside the project.
 */
export function parseTrialCase(
  value: string,
  expected: TrialExpectation
): Effect.Effect<TrialCase, InvalidTrialCase> {
  const separator = value.indexOf("=")
  const target = separator === -1 ? value : value.slice(0, separator)
  const source = Option.liftPredicate(value.slice(separator + 1), () => separator !== -1)
  const path = posix.normalize(target.replaceAll("\\", "/"))

  if (target.length === 0 || Option.exists(source, (file) => file.length === 0)) {
    return Effect.fail(new InvalidTrialCase({ reason: "Give a path, or `<path>=<file>`.", value }))
  }

  // A drive path, such as `C:/src/a.ts`, is absolute only on Windows.
  if (
    posix.isAbsolute(path)
    || win32.isAbsolute(path)
    || path === ".."
    || path.startsWith("../")
    || path === "."
  ) {
    return Effect.fail(
      new InvalidTrialCase({
        reason: "The path must be a file inside the project, relative to the project root.",
        value,
      })
    )
  }

  return Effect.succeed({ expected, path, source })
}

/**
 * The config that a trial writes in place of the config that lints the cases. An override at the
 * end of the list wins, so the trial setting replaces the setting of the project for the cases.
 * Oxlint ignores a built-in rule whose plugin the config does not turn on, so the override turns it
 * on.
 */
export function renderTrialConfig(options: {
  readonly config: string
  readonly files: readonly string[]
  readonly plugin: Option.Option<string>
  readonly rule: string
  readonly settingOptions: readonly Schema.Json[]
}): string {
  const override = {
    files: options.files,
    ...Option.match(options.plugin, {
      onNone: () => ({}),
      onSome: (plugin) => ({ plugins: [plugin] }),
    }),
    rules: { [options.rule]: ["error", ...options.settingOptions] },
  }

  return [
    "// `adamantite rule try` wrote this file in a copy of the project.",
    `import config from ${JSON.stringify(`./${options.config}`)}`,
    "",
    "export default {",
    "  ...config,",
    `  overrides: [...(config.overrides ?? []), ${JSON.stringify(override)}],`,
    "}",
    "",
  ].join("\n")
}

/**
 * Replaces `config` in the copy with the trial config that `render` gives for the name of the moved
 * config. The moved config stays in its folder, so its relative imports and `custom()` calls work.
 */
export const replaceConfig = Effect.fn("replaceConfig")(function* (
  config: string,
  render: (base: string) => string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const base = `${BASE_CONFIG_NAME}${path.extname(config)}`

  yield* fs.rename(config, path.join(path.dirname(config), base))
  yield* writeFile(config, render(base))
})

/**
 * The config that turns each rule on again in each override that turns it off. It removes only the
 * rule from the override, so the setting of the earlier layers applies again.
 */
export function renderOverrideTrialConfig(options: {
  readonly config: string
  /**
   * The rules to remove from each override, by the index of the override in `overrides`.
   */
  readonly removals: ReadonlyMap<number, readonly string[]>
}): string {
  return [
    "// `adamantite harden` wrote this file in a copy of the project.",
    `import config from ${JSON.stringify(`./${options.config}`)}`,
    "",
    `const removals = new Map(${JSON.stringify([...options.removals])})`,
    "",
    "export default {",
    "  ...config,",
    "  overrides: (config.overrides ?? []).map((override, index) => ({",
    "    ...override,",
    "    rules: Object.fromEntries(",
    "      Object.entries(override.rules ?? {}).filter(",
    "        ([rule]) => !(removals.get(index) ?? []).includes(rule)",
    "      )",
    "    ),",
    "  })),",
    "}",
    "",
  ].join("\n")
}

/**
 * A copy of the project in a temporary folder that the scope removes. It has the files that git
 * lists, with their uncommitted changes, and the dependencies of the root and the workspace
 * packages. A file that git ignores, such as generated code, is not in the copy.
 *
 * Each `node_modules` folder of the copy is a real folder with a link to each entry of the project
 * folder, except `.cache`. `custom()` writes its entry module to `node_modules/.cache`, so the
 * module stays in the copy and leaves with it. An entry that links to a workspace package links to
 * the copy of the package, so a config that imports the package loads the copy.
 */
export const makeProjectCopy = Effect.fn("makeProjectCopy")(
  function* (cwd: string) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const files = yield* listProjectFiles(cwd)

    if (Option.isNone(files)) {
      return yield* new TrialProjectUnlisted({ cwd })
    }

    const copy = yield* fs.makeTempDirectoryScoped({ prefix: "adamantite-trial-" })
    const folders = Array.dedupe(files.value.map((file) => path.dirname(path.join(copy, file))))

    yield* Effect.forEach(folders, (folder) => fs.makeDirectory(folder, { recursive: true }), {
      concurrency: 16,
      discard: true,
    })
    yield* Effect.forEach(
      files.value,
      (file) =>
        fs.copyFile(path.join(cwd, file), path.join(copy, file)).pipe(
          // The git index also has the files that a delete left out of the working tree.
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.void
          )
        ),
      { concurrency: 16, discard: true }
    )

    const packages = [cwd, ...(yield* getWorkspacePackageDirectories(cwd))]
    // A file of the project outside each `node_modules` folder, such as a workspace package, has a
    // copy. A real path can differ from `cwd` in a folder link, such as `/var` on macOS.
    const root = yield* fs.realPath(cwd)
    const toCopy = (file: string) => {
      const relative = path.relative(root, file)

      return Option.liftPredicate(
        path.join(copy, relative),
        () =>
          relative !== ""
          && relative !== ".."
          && !relative.startsWith(`..${path.sep}`)
          && !path.isAbsolute(relative)
          && !relative.split(path.sep).includes("node_modules")
      )
    }
    // The packages of a `node_modules` folder, with the packages of each scope folder, such as
    // `@acme/ui`, in place of the folder.
    const listPackages = Effect.fnUntraced(function* (modules: string) {
      const entries = yield* readDirectoryIfExists(modules)
      const packages = yield* Effect.forEach(
        Option.getOrElse(entries, () => []).filter((entry) => entry !== ".cache"),
        Effect.fnUntraced(function* (entry) {
          const isScope =
            entry.startsWith("@")
            && !(yield* fs.readLink(path.join(modules, entry)).pipe(
              Effect.as(true),
              Effect.orElseSucceed(() => false)
            ))
          const scoped = isScope
            ? yield* readDirectoryIfExists(path.join(modules, entry))
            : Option.none()

          return Option.match(scoped, {
            onNone: () => [entry],
            onSome: (names) => names.map((name) => `${entry}/${name}`),
          })
        }),
        { concurrency: "unbounded" }
      )

      return entries.pipe(Option.as(packages.flat()))
    })

    yield* Effect.forEach(
      packages,
      Effect.fnUntraced(function* (directory) {
        const modules = path.join(directory, "node_modules")
        const target = path.join(copy, path.relative(cwd, directory), "node_modules")
        const entries = yield* listPackages(modules)

        if (Option.isSome(entries)) {
          yield* fs.makeDirectory(target, { recursive: true })
        }

        yield* Effect.forEach(
          Option.getOrElse(entries, () => []),
          Effect.fnUntraced(function* (entry) {
            const source = path.join(modules, entry)
            // A broken link has no real path, so the copy links to the same missing file.
            const resolved = yield* fs.realPath(source).pipe(Effect.option)

            yield* fs.makeDirectory(path.dirname(path.join(target, entry)), { recursive: true })
            yield* fs.symlink(
              resolved.pipe(
                Option.flatMap((file) => toCopy(file)),
                Option.getOrElse(() => source)
              ),
              path.join(target, entry)
            )
          }),
          { discard: true }
        )
      }),
      { discard: true }
    )

    return copy
  },
  Effect.catchTag("PlatformError", (cause) =>
    Effect.fail(new FailedToWriteFile({ cause, path: "the copy of the project" }))
  )
)

/**
 * The config that Oxlint uses for `file` in the copy: the nearest config in its folder or in a
 * folder above it, as Oxlint finds nested configs.
 */
const findConfig = Effect.fn("findConfig")(function* (copy: string, file: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const candidates: string[] = []

  for (
    let folder = path.dirname(path.join(copy, file));
    folder === copy || folder.startsWith(`${copy}${path.sep}`);
    folder = path.dirname(folder)
  ) {
    candidates.push(...CONFIG_FILES.map((name) => path.join(folder, name)))
  }

  return yield* Effect.findFirst(candidates, (candidate) =>
    fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
  )
})

/**
 * Splits the cases into rounds in which each path is there one time, so that two cases can have the
 * same path, such as the code before and after a fix.
 */
function toRounds<A extends { readonly case: TrialCase }>(entries: readonly A[]) {
  const rounds: A[][] = []

  for (const entry of entries) {
    const round = rounds.find((candidate) =>
      candidate.every((other) => other.case.path !== entry.case.path)
    )

    if (round === undefined) {
      rounds.push([entry])
    } else {
      round.push(entry)
    }
  }

  return rounds
}

/**
 * Lints each case in a copy of the project, with the rule at the setting of the trial, and returns
 * the reports of the rule on each case, in the order of the cases. The project stays unchanged.
 */
export const tryRule = Effect.fn("tryRule")(
  function* (options: {
    readonly cases: readonly TrialCase[]
    readonly cwd: string
    readonly rule: string
    readonly setting: TrialSetting
  }) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { cases, cwd, rule, setting } = options
    const { name: ruleName, plugin } = splitRuleName(rule)
    const builtIns = yield* listBuiltInRules(cwd)
    const copy = yield* makeProjectCopy(cwd)
    const toProjectPath = (file: string) => path.relative(copy, file).split(path.sep).join("/")
    // Oxlint fails to load a config with a rule or a plugin that does not exist. Only a trial
    // config can add a rule that the project config does not have.
    const toRuleNotFound = (error: CliNotFound | TrialLintFailed) => {
      const detail = [
        `Rule '${ruleName}' not found in plugin '${plugin}'`,
        `Plugin '${plugin}' not found`,
      ].find((message) => error._tag === "TrialLintFailed" && error.output.includes(message))

      return setting._tag === "Error" && detail !== undefined
        ? new TrialRuleNotFound({ detail, rule })
        : error
    }

    const linted = yield* Effect.forEach(
      cases,
      Effect.fnUntraced(function* (trialCase) {
        if (
          Option.isNone(trialCase.source)
          && !(yield* fs.exists(path.join(copy, trialCase.path)))
        ) {
          // The copy has only the files that git lists.
          return yield* new InvalidTrialCase({
            reason: (yield* fs.exists(path.join(cwd, trialCase.path)))
              ? "Git ignores this file, so the copy of the project does not have it. Use `<path>=<file>` to lint its content."
              : "The project has no such file. Use `<path>=<file>` to lint other content.",
            value: trialCase.path,
          })
        }

        const config = yield* findConfig(copy, trialCase.path)

        if (Option.isNone(config)) {
          return yield* new TrialConfigNotFound({ path: trialCase.path })
        }

        return {
          case: trialCase,
          config: config.value,
          // The `files` of an override are relative to the folder of its config.
          configFile: path
            .relative(path.dirname(config.value), path.join(copy, trialCase.path))
            .split(path.sep)
            .join("/"),
        }
      }),
      { concurrency: 1 }
    )

    if (setting._tag === "Error") {
      for (const config of Array.dedupe(linted.map((entry) => entry.config))) {
        yield* replaceConfig(config, (base) =>
          renderTrialConfig({
            config: base,
            files: Array.dedupe(
              linted.filter((entry) => entry.config === config).map((entry) => entry.configFile)
            ),
            plugin: Option.liftPredicate(
              plugin,
              (name) => name !== "eslint" && builtIns.plugins.has(name)
            ),
            rule,
            settingOptions: setting.options,
          })
        )
      }
    }

    const results = new Map<TrialCase, TrialCaseResult>()

    for (const round of toRounds(linted)) {
      // Each case with a source replaces the project file at its path for this round only.
      const placed = round.flatMap((entry) =>
        Option.match(entry.case.source, {
          onNone: () => [],
          onSome: (source) => [
            { source: path.resolve(cwd, source), target: path.join(copy, entry.case.path) },
          ],
        })
      )
      const originals = yield* Effect.forEach(
        placed,
        ({ target }) => fs.readFileString(target).pipe(Effect.option),
        { concurrency: "unbounded" }
      )

      for (const { source, target } of placed) {
        yield* fs.makeDirectory(path.dirname(target), { recursive: true })
        yield* writeFile(target, yield* readFile(source))
      }

      // Oxlint runs from the root, as a project lint does, so the root config gives the options
      // that only a root config can set, such as `typeAware`, and the nearest config gives the
      // rules of each case.
      const files = round.map((entry) => entry.case.path)
      const report = yield* lintFiles(copy, files).pipe(
        Effect.mapError((error) => toRuleNotFound(error))
      )

      if (report.number_of_files < files.length) {
        const listed = new Set(yield* listLintedFiles(copy, files))

        return yield* new TrialCaseIgnored({
          path: files.find((file) => !listed.has(file)) ?? files[0] ?? "",
        })
      }

      yield* Effect.forEach(
        placed,
        ({ target }, index) =>
          Option.match(originals[index] ?? Option.none(), {
            onNone: () => fs.remove(target),
            onSome: (content) => fs.writeFileString(target, content),
          }),
        { concurrency: 1, discard: true }
      )

      for (const entry of round) {
        const reports = report.diagnostics.filter(
          (diagnostic) => diagnostic.filename === entry.case.path
        )
        const parseErrors = reports.filter((diagnostic) => diagnostic.code === undefined)

        if (parseErrors.length > 0) {
          return yield* new TrialCaseUnparsable({
            errors: parseErrors.map((diagnostic) => diagnostic.message),
            path: entry.case.path,
          })
        }

        results.set(entry.case, {
          case: entry.case,
          config: toProjectPath(entry.config),
          diagnostics: reports
            .filter(
              (diagnostic) =>
                diagnostic.code !== undefined && isReportOf(diagnostic.code, rule, builtIns)
            )
            .map((diagnostic) => ({
              column: diagnostic.labels[0]?.span.column ?? 1,
              line: diagnostic.labels[0]?.span.line ?? 1,
              message: diagnostic.message,
            })),
        })
      }
    }

    return Array.getSomes(cases.map((trialCase) => Option.fromUndefinedOr(results.get(trialCase))))
  },
  Effect.scoped,
  Effect.catchTag("PlatformError", (cause) =>
    Effect.fail(new FailedToWriteFile({ cause, path: "the copy of the project" }))
  )
)
