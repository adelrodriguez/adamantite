import { readdirSync } from "node:fs"
import { extname, join } from "node:path"

// What a rules folder holds. `custom()` and `loadRules` both read rules folders, so they share this
// module. The package exports map does not list it, so it is not public. This module runs under
// whatever runtime executes oxlint in the target project, so it uses only APIs that Node.js and Bun
// both provide.

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it.
 */
export const DEFAULT_DIRECTORY = ".adamantite/lint"

/**
 * The folder, relative to a project, where `custom()` writes the entry module of each rules folder.
 * A test in the CLI checks that the trial copy of `adamantite rule try` does not link this folder
 * to the project.
 */
export const CACHE_DIRECTORY: string = join("node_modules", ".cache", "adamantite")

/**
 * The plugin name that prefixes every rule when `custom()` is given no `name`.
 */
export const DEFAULT_PLUGIN_NAME = "project"

/**
 * The extensions of rule files.
 */
export const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

export function getRuleName(file: string): string {
  return file.slice(0, -extname(file).length)
}

/**
 * Whether a file in a rules folder is a rule: it has a JavaScript or TypeScript extension, is not a
 * declaration or test file, and does not start with `_`.
 */
export function isRuleFile(name: string): boolean {
  return (
    RULE_FILE_EXTENSIONS.has(extname(name))
    && !name.startsWith("_")
    && !/\.(?:d\.m?ts|test\.[^.]+)$/.test(name)
  )
}

/**
 * The rule files in a rules folder. Subfolders are not read, so helpers can also live there. Each
 * rule name must have one file, because `custom()` and `loadRules` key the rules by name. Two files
 * for one name, such as `no-foo.js` and `no-foo.ts`, throw instead of one silently replacing the
 * other.
 */
export function listRuleFiles(dir: string): string[] {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRuleFile(entry.name))
    .map((entry) => entry.name)

  const filesByRule = new Map<string, string[]>()

  for (const file of files) {
    filesByRule.set(getRuleName(file), [...(filesByRule.get(getRuleName(file)) ?? []), file])
  }

  for (const [rule, ruleFiles] of filesByRule) {
    if (ruleFiles.length > 1) {
      throw new Error(
        `The rules folder ${dir} has more than one file for the rule \`${rule}\`: ${ruleFiles.join(", ")}. Keep one of them.`
      )
    }
  }

  return files
}
