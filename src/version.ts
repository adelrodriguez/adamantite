import { readFileSync } from "node:fs"
import { join } from "node:path"

export function getPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"))

  return packageJson.version
}
