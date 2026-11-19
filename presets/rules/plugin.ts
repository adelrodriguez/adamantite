import type { Plugin, Rule } from "@oxlint/plugins"

export type * from "@oxlint/plugins"

/**
 * Define a plugin. It returns the plugin unchanged and only checks its type.
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}

/**
 * Define a rule. It returns the rule unchanged and only checks its type.
 */
export function defineRule(rule: Rule): Rule {
  return rule
}
