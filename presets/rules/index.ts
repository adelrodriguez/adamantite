import type { Plugin, Rule } from "@oxlint/plugins"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { DEFAULT_PLUGIN_NAME, getRuleName, listRuleFiles } from "../lint/custom.ts"

// The authoring surface for custom rules. A rule file in `.adamantite/rules/` imports from here, so
// it needs no other dependency. This module runs under whatever runtime executes oxlint in the
// target project, so it uses only APIs that Node.js and Bun both provide.

export { defineRule } from "@oxlint/plugins"
export type {
  Context,
  Diagnostic,
  ESTree,
  Fix,
  Fixer,
  Node,
  Options,
  Rule,
  RuleMeta,
  SourceCode,
  Visitor,
  VisitorWithHooks,
} from "@oxlint/plugins"

async function importRule(path: string) {
  let module: { readonly default?: Rule }

  try {
    module = await import(pathToFileURL(path).href)
  } catch (error) {
    // Oxlint prints only the message of a plugin load error, so the message carries the cause.
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(
      `Custom rule ${path} failed to load: ${reason}\nRule files run with type stripping, so use erasable TypeScript only: no enum, namespace, or parameter properties.`,
      { cause: error }
    )
  }

  if (module.default === undefined) {
    throw new Error(`Custom rule ${path} has no default export. Export the rule as default.`)
  }

  return module.default
}

/**
 * Import every rule file in a rules folder and return them as one Oxlint plugin. The entry module
 * that `custom()` writes calls this function.
 */
export async function loadRules(dir: string, name: string = DEFAULT_PLUGIN_NAME): Promise<Plugin> {
  const rules = await Promise.all(
    listRuleFiles(dir).map(
      async (file) => [getRuleName(file), await importRule(join(dir, file))] as const
    )
  )

  return { meta: { name }, rules: Object.fromEntries(rules) }
}
