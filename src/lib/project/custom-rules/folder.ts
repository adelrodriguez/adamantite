/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it. A test keeps it equal to `DEFAULT_DIRECTORY` in `presets/rules/folder.ts`.
 */
export const CUSTOM_RULES_DIRECTORY = ".adamantite/lint"

/**
 * The extensions of rule files. A test keeps them equal to the ones in `presets/rules/folder.ts`.
 */
export const RULE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".mts", ".ts"])

/**
 * Whether a file in a rules folder is a rule. Keep this the same as `isRuleFile` in
 * `presets/rules/folder.ts`, which decides what Oxlint loads.
 */
export function isRuleFile(name: string): boolean {
  const extension = /\.[^.]+$/.exec(name)?.[0] ?? ""

  return (
    RULE_FILE_EXTENSIONS.has(extension)
    && !name.startsWith("_")
    && !/\.(?:d\.m?ts|test\.[^.]+)$/.test(name)
  )
}

/**
 * An optional test beside a rule. Helpers that start with `_` are not test entries.
 */
export function isRuleTestFile(name: string): boolean {
  return !name.startsWith("_") && /\.test\.(?:js|mjs|mts|ts)$/.test(name)
}
