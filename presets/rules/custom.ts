import { createHash, randomUUID } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { DummyRule, OxlintConfig } from "oxlint"
import {
  CACHE_DIRECTORY,
  DEFAULT_DIRECTORY,
  DEFAULT_PLUGIN_NAME,
  getRuleName,
  listRuleFiles,
} from "./folder.ts"

// Custom rules are Oxlint rules that the target project writes in its own rules folder. `custom()`
// runs while Oxlint loads the config. It lists the rule files, enables each one, and points Oxlint
// at a small entry module that loads the folder through the internal `loadRules` module.
//
// Oxlint caches a plugin module by its path and drops query strings, so each rules folder gets its
// own entry module file. The entry module imports `loadRules` by file URL, so it works from the
// temporary directory too. The source tree holds `rules/load.ts` and the dist tree holds
// `rules/load.js`, so the extension follows the extension of this module. This module runs under
// whatever runtime executes oxlint in the target project, so it uses only APIs that Node.js and Bun
// both provide.
const MODULE_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"
const RULES_MODULE_URL = new URL(`load.${MODULE_EXTENSION}`, import.meta.url).href

export interface CustomRulesOptions {
  /**
   * The rules folder. A relative path resolves from the file that calls `custom()`, not from the
   * working directory. Default: `.adamantite/lint`.
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

function hasContent(path: string, content: string) {
  return existsSync(path) && readFileSync(path, "utf8") === content
}

/**
 * Write `content` to `path` unless the file already holds it. Several Oxlint processes can load the
 * config at once, as in a monorepo task runner, and one can import the module while another writes
 * it. A write in place truncates the file first, so the module goes to a temporary file that a
 * rename moves over `path` in one step.
 */
function writeIfChanged(path: string, content: string) {
  if (hasContent(path, content)) {
    return
  }

  mkdirSync(dirname(path), { recursive: true })

  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`

  writeFileSync(temporary, content, { flag: "wx" })

  try {
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })

    // Windows refuses to replace a file that another process has open. That process wrote the
    // same content, because the file name comes from the content.
    if (!hasContent(path, content)) {
      throw error
    }
  }
}

/**
 * A folder in the OS temporary directory that only the current user can write. The temporary
 * directory can be shared, so another user could create a folder there first, and then replace an
 * entry module after `custom()` writes it. Windows gives each user a temporary directory.
 */
function getPrivateTemporaryDirectory() {
  // The effective user ID, without the account lookup of `os.userInfo()`, which throws for a user
  // without a passwd entry, such as in a container. Windows has no user IDs.
  const uid = process.geteuid?.()
  const dir = join(tmpdir(), uid === undefined ? "adamantite" : `adamantite-${uid}`)

  mkdirSync(dir, { mode: 0o700, recursive: true })

  const stats = lstatSync(dir)

  if (
    uid !== undefined
    && (!stats.isDirectory() || stats.uid !== uid || (stats.mode & 0o022) !== 0)
  ) {
    throw new Error(`${dir} is not a folder that only the current user can write.`)
  }

  return dir
}

/**
 * Write the entry module for a rules folder and return its file URL. The module goes to
 * `node_modules/.cache/adamantite` above the folder, or to a private folder in the OS temporary
 * directory when no `node_modules` folder is found or it cannot be written.
 */
function writeEntryModule(dir: string, name: string) {
  // The content names this Adamantite copy, so two installed copies get two files.
  const hash = createHash("sha256")
    .update(`${RULES_MODULE_URL}\0${dir}\0${name}`)
    .digest("hex")
    .slice(0, 16)

  const fileName = `rules-${hash}.mjs`

  const content = [
    `import { loadRules } from ${JSON.stringify(RULES_MODULE_URL)}`,
    "",
    `export default await loadRules(${JSON.stringify(dir)}, ${JSON.stringify(name)})`,
    "",
  ].join("\n")

  const root = findNodeModules(dir)

  const folders = [
    ...(root === undefined ? [] : [() => join(root, CACHE_DIRECTORY)]),
    () => getPrivateTemporaryDirectory(),
  ]

  const failures: unknown[] = []

  for (const folder of folders) {
    try {
      const path = join(folder(), fileName)

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
 * import custom from "adamantite/rules"
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
