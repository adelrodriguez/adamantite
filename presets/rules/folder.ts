import { readdirSync } from "node:fs"
import { extname } from "node:path"

// What a rules folder holds. `custom()` and `loadRules` both read rules folders, so they share this
// module. The package exports map does not list it, so it is not public. This module runs under
// whatever runtime executes oxlint in the target project, so it uses only APIs that Node.js and Bun
// both provide.

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it.
 */
export const DEFAULT_DIRECTORY = ".adamantite/rules"

/**
 * The plugin name that prefixes every rule when `custom()` is given no `name`.
 */
export const DEFAULT_PLUGIN_NAME = "project"

const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

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
