import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, Layer } from "effect"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import { Cwd } from "#services/cwd.ts"
import { readPackageJson } from "#utils.ts"

const ROOT_DIR = join(import.meta.dir, "..")

describe("helpers", () => {
  test("helper versions stay aligned with package.json devDependencies", async () => {
    const packageJson = await readPackageJson(ROOT_DIR).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, Cwd.layer)),
      Effect.runPromise
    )

    expect(packageJson.devDependencies?.oxlint).toBe(oxlint.version)
    expect(packageJson.devDependencies?.["oxlint-tsgolint"]).toBe(tsgolint.version)
    expect(packageJson.devDependencies?.oxfmt).toBe(oxfmt.version)
    expect(packageJson.devDependencies?.sherif).toBe(sherif.version)
    expect(packageJson.devDependencies?.knip).toBe(knip.version)
    expect(packageJson.devDependencies?.typescript).toBe(typescript.version)
  })
})
