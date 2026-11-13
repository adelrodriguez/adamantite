// The first-party plugins, by rule namespace. Each one is the folder with that name beside this
// module, and its `index.ts` registers the rules under the same name.
export const FIRST_PARTY_PLUGINS = ["adamantite", "anti-slop", "anti-slop-effect"] as const

type FirstPartyPlugin = (typeof FIRST_PARTY_PLUGINS)[number]

/**
 * A `jsPlugins` entry of an Oxlint config.
 */
interface PluginEntry {
  readonly name: FirstPartyPlugin
  readonly specifier: string
}

// The source tree holds `<name>/index.ts` and the dist tree holds `<name>/index.js`, so the plugin
// extension follows the extension of this module. Oxlint loads a TypeScript plugin only in the
// source tree, where Node.js strips the types.
const EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"

/**
 * Return the `jsPlugins` entry of a first-party plugin. Oxlint loads the plugin by file URL from
 * this package, so target projects install nothing extra. This module imports no plugin code, so a
 * preset loads no rule module.
 */
export function firstPartyPlugin(name: FirstPartyPlugin): PluginEntry {
  return { name, specifier: new URL(`${name}/index.${EXTENSION}`, import.meta.url).href }
}
