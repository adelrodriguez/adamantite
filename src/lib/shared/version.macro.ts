import type { PackageJson } from "type-fest"
import { MissingPackageVersion } from "#lib/shared/errors.ts"
import packageJson from "../../../package.json" with { type: "json" }

/**
 * Build-time macros for reading versions from this repository's `package.json`. Results are inlined
 * into the bundle, so both the CLI's own version and the tooling integration versions stay in sync
 * with what Adamantite is built against without hardcoded constants.
 *
 * These are intentionally synchronous: they run during bundling (via `with { type: "macro" }`), and
 * the resulting value is inlined at the call site. Reading `package.json` through a static JSON
 * import keeps the macros free of `await`, so consuming modules do not need top-level `await`.
 */

const pkg = packageJson as PackageJson

export function getPackageVersion(): string {
  if (!pkg.version) {
    throw new MissingPackageVersion({ path: "package.json" })
  }

  return pkg.version
}

export function getDependencyVersion(name: string): string {
  const version = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name]

  if (!version) {
    throw new MissingPackageVersion({ dependency: name, path: "package.json" })
  }

  return version
}
