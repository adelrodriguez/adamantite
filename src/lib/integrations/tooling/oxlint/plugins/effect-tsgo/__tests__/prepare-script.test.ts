import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { updatePrepareScript } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/prepare-script.ts"

const ROOT = "/project"
const PREPARE = "adamantite prepare"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function makePackageJson(manifest: PackageJson) {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...manifest }, null, 2)
}

describe("prepare-script", () => {
  describe("updatePrepareScript", () => {
    it.effect("add adamantite prepare when the project has no prepare script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": makePackageJson({ scripts: { test: "vitest" } }),
        })

        const result = yield* updatePrepareScript(ROOT).pipe(provideFiles(files))

        expect(result).toBe("added")
        expect(JSON.parse(files.read("package.json"))).toMatchObject({
          scripts: { prepare: PREPARE, test: "vitest" },
        })
      })
    )

    it.effect("run adamantite prepare before the commands of an existing prepare script", () =>
      Effect.gen(function* () {
        // Husky's setup for a project below the Git root changes directory, so a command after it
        // would run outside the project.
        // The parentheses keep a fallback such as `|| true` from also catching a failed patch.
        for (const prepare of ["husky", "cd .. && husky frontend/.husky", "husky || true"]) {
          const files = makeFiles({ "package.json": makePackageJson({ scripts: { prepare } }) })

          const result = yield* updatePrepareScript(ROOT).pipe(provideFiles(files))

          expect(result).toBe("merged")
          expect(JSON.parse(files.read("package.json"))).toMatchObject({
            scripts: { prepare: `${PREPARE} && (${prepare})` },
          })
        }
      })
    )

    it.effect("keep the indentation of package.json", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json":
            '{\n\t"name": "test-project",\n\t"scripts": {\n\t\t"test": "vitest"\n\t}\n}\n',
        })

        yield* updatePrepareScript(ROOT).pipe(provideFiles(files))

        expect(files.read("package.json")).toBe(
          `{\n\t"name": "test-project",\n\t"scripts": {\n\t\t"test": "vitest",\n\t\t"prepare": "${PREPARE}"\n\t}\n}\n`
        )
      })
    )

    it.effect("update the last of repeated prepare scripts, which is the one that runs", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json":
            '{\n  "scripts": {\n    "prepare": "husky",\n    "prepare": "husky"\n  }\n}\n',
        })

        yield* updatePrepareScript(ROOT).pipe(provideFiles(files))

        expect(files.read("package.json")).toBe(
          `{\n  "scripts": {\n    "prepare": "${PREPARE} && (husky)"\n  }\n}\n`
        )
      })
    )

    it.effect("keep a prepare script that already runs adamantite prepare", () =>
      Effect.gen(function* () {
        const packageJson = makePackageJson({ scripts: { prepare: `${PREPARE} && husky` } })
        const files = makeFiles({ "package.json": packageJson })

        const result = yield* updatePrepareScript(ROOT).pipe(provideFiles(files))

        expect(result).toBe("present")
        expect(files.read("package.json")).toBe(packageJson)
      })
    )
  })
})
