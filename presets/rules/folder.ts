import { readdirSync } from "node:fs"
import { extname, join } from "node:path"

export const DEFAULT_DIRECTORY = ".adamantite/lint"

export const CACHE_DIRECTORY: string = join("node_modules", ".cache", "adamantite")

export const DEFAULT_PLUGIN_NAME = "project"

export const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

export function getRuleName(file: string): string {
  return file.slice(0, -extname(file).length)
}

export function isRuleFile(name: string): boolean {
  return (
    RULE_FILE_EXTENSIONS.has(extname(name))
    && !name.startsWith("_")
    && !/\.(?:d\.m?ts|test\.[^.]+)$/.test(name)
  )
}

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
