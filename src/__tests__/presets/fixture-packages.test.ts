import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { FIXTURE_PACKAGES_DIR } from "./fixture-packages.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const Dependencies = Schema.optionalKey(Schema.Record(Schema.String, Schema.String))

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ dependencies: Dependencies, devDependencies: Dependencies })
  )
)

function listPackages(dir: string): string[] {
  const manifest = decodeManifest(readFileSync(join(dir, "package.json"), "utf8"))

  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]
}

describe("fixture packages", () => {
  // A fixture project links the packages of the repository and the fixture packages into one
  // `node_modules`, so a package in both manifests has no single version.
  it("add only packages that the repository does not install", () => {
    const repositoryPackages = listPackages(REPO_ROOT)

    expect(
      listPackages(FIXTURE_PACKAGES_DIR).filter((name) => repositoryPackages.includes(name))
    ).toStrictEqual([])
  })
})
