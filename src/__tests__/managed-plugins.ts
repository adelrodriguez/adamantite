import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"

export function managedPlugin(name: (typeof managedPlugins)[number]["name"]) {
  return Option.getOrThrow(Array.findFirst(managedPlugins, (plugin) => plugin.name === name))
}
