import { readFile } from "node:fs/promises"
import type { PackageJson } from "type-fest"
import { MissingPackageVersion } from "#errors.ts"

export async function getPackageVersion() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  ) as PackageJson

  if (!packageJson.version) {
    throw new MissingPackageVersion({ path: "package.json" })
  }

  return packageJson.version
}
