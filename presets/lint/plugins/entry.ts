export const FIRST_PARTY_PLUGINS = ["adamantite", "quality", "quality-effect", "testing"] as const

export type FirstPartyPlugin = (typeof FIRST_PARTY_PLUGINS)[number]

interface PluginEntry {
  readonly name: FirstPartyPlugin
  readonly specifier: string
}

// The source tree holds `<name>/index.ts` and the dist tree holds `<name>/index.js`, so the plugin
// extension follows the extension of this module. Oxlint loads a TypeScript plugin only in the
// source tree, where Node.js strips the types.
const EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"

export function firstPartyPlugin(name: FirstPartyPlugin): PluginEntry {
  return { name, specifier: new URL(`${name}/index.${EXTENSION}`, import.meta.url).href }
}
