/// <reference types="node" />
import type { KnipConfiguration } from "knip"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

/**
 * `adamantite analyze` runs Sherif in monorepos, and Knip has no plugin that sees that reference.
 * The ignore applies only when the project declares Sherif, because Knip prints a configuration
 * hint for an ignore that matches nothing.
 */
function declaresSherif(): boolean {
  try {
    // SAFETY: only the presence of the `sherif` key is read, and a parse failure is caught.
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    return (manifest.dependencies?.["sherif"] ?? manifest.devDependencies?.["sherif"]) !== undefined
  } catch {
    return false
  }
}

const config: KnipConfiguration = {
  ignoreDependencies: declaresSherif() ? ["sherif"] : [],
  ignoreExportsUsedInFile: true,
  rules: {
    binaries: "error",
    catalog: "error",
    dependencies: "error",
    devDependencies: "error",
    duplicates: "warn",
    enumMembers: "off",
    exports: "warn",
    files: "error",
    namespaceMembers: "warn",
    nsExports: "warn",
    nsTypes: "warn",
    optionalPeerDependencies: "warn",
    types: "warn",
    unlisted: "error",
    unresolved: "error",
  },
}

export default config
