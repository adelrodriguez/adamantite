import type { PackageJson } from "type-fest"
import { MissingPackageVersion } from "#lib/shared/errors.ts"
import packageJson from "../../../package.json" with { type: "json" }

const pkg: Pick<PackageJson, "dependencies" | "devDependencies" | "version"> = packageJson

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
