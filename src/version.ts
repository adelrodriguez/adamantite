import { Fault } from "faultier"
import { readPackageJson } from "#utils.ts"

export async function getPackageVersion() {
  const packageJson = await readPackageJson()

  if (packageJson.isErr()) {
    throw packageJson.error
  }

  const version = packageJson.value.version

  if (!version) {
    throw Fault.create("MISSING_PACKAGE_VERSION").withDescription(
      "Missing package version",
      "The package version is not specified in the package.json file."
    )
  }

  return version
}
