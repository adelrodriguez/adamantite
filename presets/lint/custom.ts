import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, extname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { DummyRule, OxlintConfig } from "oxlint"

// Custom rules are Oxlint rules that the target project writes in its own rules folder. `custom()`
// runs while Oxlint loads the config. It lists the rule files, enables each one, and points Oxlint
// at a small entry module that loads the folder through `loadRules` from `adamantite/rules`.
//
// Oxlint caches a plugin module by its path and drops query strings, so each rules folder gets its
// own entry module file. The entry module imports `loadRules` by file URL, so it works from the
// temporary directory too. The source tree holds `rules/index.ts` and the published dist tree holds
// `rules/index.js`, so the extension follows this module's own, as in the strict preset. This module runs
// under whatever runtime executes oxlint in the target project, so it uses only APIs that Node.js
// and Bun both provide.
const MODULE_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"
const RULES_MODULE_URL = new URL(`../rules/index.${MODULE_EXTENSION}`, import.meta.url).href

const DEFAULT_DIRECTORY = ".adamantite/rules"
const CACHE_DIRECTORY = join("node_modules", ".cache", "adamantite")

/**
 * The plugin name that `custom()` uses when no `name` is given.
 */
export const DEFAULT_PLUGIN_NAME = "project"

const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

/**
 * The rule name that a rule file defines: its file name without the extension.
 */
export function getRuleName(file: string): string {
  return file.slice(0, -extname(file).length)
}

/**
 * Whether a file in a rules folder is a rule: it has a JavaScript or TypeScript extension, is not a
 * declaration file, and does not start with `_`.
 */
export function isRuleFile(name: string): boolean {
  return (
    RULE_FILE_EXTENSIONS.has(extname(name)) && !name.startsWith("_") && !/\.d\.m?ts$/.test(name)
  )
}

/**
 * The rule files in a rules folder. Subfolders are not read, so helpers can also live there.
 */
export function listRuleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRuleFile(entry.name))
    .map((entry) => entry.name)
}

export interface CustomRulesOptions {
  /**
   * The rules folder. A relative path resolves from the file that calls `custom()`, not from the
   * working directory. Default: `.adamantite/rules`.
   */
  readonly dir?: string
  /**
   * The plugin name, which prefixes every rule, as in `project/no-process-env`. Oxlint rejects two
   * plugins with the same name in one run, so give each rules folder in a monorepo its own name.
   * Default: `project`.
   */
  readonly name?: string
  /**
   * Severity or options for a rule, by rule name without the plugin prefix. Every rule is enabled
   * as `"error"` by default.
   */
  readonly rules?: Readonly<Record<string, DummyRule>>
}

/**
 * Normalize a file from a stack frame: drop the query string and hash, which Oxlint adds to bypass
 * the module cache, and convert a file URL to a path.
 */
function toFramePath(location: string) {
  if (location.startsWith("file://")) {
    const url = new URL(location)

    url.search = ""
    url.hash = ""

    return fileURLToPath(url)
  }

  return location.replace(/[?#].*$/, "")
}

const OWN_FILE = toFramePath(import.meta.url)

// Node.js prints `at file:///path/config.ts?cache=1:2:19` and `at name (file:///path:1:2)`. Bun
// prints `at /path/config.ts:2:19` and `at name (/path:1:2)`. Windows paths start with a drive.
const FRAME_LOCATION = /(?:\(|at )((?:file:\/\/|\/|[A-Za-z]:[\\/]).+?):\d+:\d+\)?\s*$/

/**
 * The first file in a stack trace that is not `ownFile`: the module that called into `ownFile`.
 * Undefined when the stack names no such file.
 */
export function findCallerFile(stack: string, ownFile: string): string | undefined {
  for (const line of stack.split("\n").slice(1)) {
    const location = FRAME_LOCATION.exec(line)?.[1]

    if (location === undefined) {
      continue
    }

    const file = toFramePath(location)

    if (file !== ownFile) {
      return file
    }
  }

  return undefined
}

function resolveRulesDirectory(dir: string, stack: string) {
  if (isAbsolute(dir)) {
    return dir
  }

  const caller = findCallerFile(stack, OWN_FILE)

  if (caller === undefined) {
    throw new Error(
      `custom() could not find the file that called it, so it cannot resolve "${dir}". Pass an absolute \`dir\`, such as \`join(import.meta.dirname, "${dir}")\`.`
    )
  }

  return resolve(dirname(caller), dir)
}

function findNodeModules(from: string) {
  for (let current = from; ; current = dirname(current)) {
    if (existsSync(join(current, "node_modules"))) {
      return current
    }

    if (dirname(current) === current) {
      return
    }
  }
}

function writeIfChanged(path: string, content: string) {
  if (existsSync(path) && readFileSync(path, "utf8") === content) {
    return
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * Write the entry module for a rules folder and return its file URL. The module goes to
 * `node_modules/.cache/adamantite` above the folder, or to the OS temporary directory when no
 * `node_modules` folder is found or it cannot be written.
 */
function writeEntryModule(dir: string, name: string) {
  const hash = createHash("sha256").update(`${dir}\0${name}`).digest("hex").slice(0, 16)
  const fileName = `rules-${hash}.mjs`
  const content = [
    `import { loadRules } from ${JSON.stringify(RULES_MODULE_URL)}`,
    "",
    `export default await loadRules(${JSON.stringify(dir)}, ${JSON.stringify(name)})`,
    "",
  ].join("\n")
  const root = findNodeModules(dir)
  const candidates = [
    ...(root === undefined ? [] : [join(root, CACHE_DIRECTORY, fileName)]),
    join(tmpdir(), "adamantite", fileName),
  ]
  const failures: unknown[] = []

  for (const path of candidates) {
    try {
      writeIfChanged(path, content)

      return pathToFileURL(path).href
    } catch (error) {
      failures.push(error)
    }
  }

  throw new AggregateError(failures, `custom() could not write the entry module for ${dir}.`)
}

/**
 * Load the custom rules in a rules folder and enable each one as `error`. A rule file
 * `no-process-env.ts` becomes the rule `project/no-process-env`. Files that start with `_` are
 * helpers, not rules.
 *
 * Without a rules folder, or with an empty one, the result is an empty config, so every project can
 * extend it.
 *
 * ```ts
 * import { defineConfig } from "oxlint"
 * import core from "adamantite/lint"
 * import custom from "adamantite/lint/custom"
 *
 * export default defineConfig({ extends: [core, custom()] })
 * ```
 */
export default function custom(options: CustomRulesOptions = {}): OxlintConfig {
  const name = options.name ?? DEFAULT_PLUGIN_NAME
  const dir = resolveRulesDirectory(
    options.dir ?? DEFAULT_DIRECTORY,
    new Error("custom()").stack ?? ""
  )

  if (!existsSync(dir)) {
    return {}
  }

  const files = listRuleFiles(dir)

  if (files.length === 0) {
    return {}
  }

  const rules: Record<string, DummyRule> = {}

  for (const file of files) {
    rules[`${name}/${getRuleName(file)}`] = "error"
  }

  for (const [rule, setting] of Object.entries(options.rules ?? {})) {
    rules[`${name}/${rule}`] = setting
  }

  return { jsPlugins: [{ name, specifier: writeEntryModule(dir, name) }], rules }
}
