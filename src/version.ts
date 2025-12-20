import { readFileSync } from "node:fs"
import { join } from "node:path"

function getPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"))

  return packageJson.version
}

const version = getPackageVersion()

export default version
