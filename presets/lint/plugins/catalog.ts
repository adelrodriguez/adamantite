import type { Plugin } from "@oxlint/plugins"
import type { FirstPartyPlugin } from "./entry.ts"
import adamantite from "./adamantite/index.ts"
import antislopEffect from "./antislop-effect/index.ts"
import antislop from "./antislop/index.ts"

/**
 * Each first-party plugin by its name, for code that reads the metadata of the rules, such as
 * Doctor. Presets load a plugin by file URL through `entry.ts`, so no preset imports this module.
 */
export const plugins: Readonly<Record<FirstPartyPlugin, Plugin>> = {
  adamantite,
  antislop,
  "antislop-effect": antislopEffect,
}
