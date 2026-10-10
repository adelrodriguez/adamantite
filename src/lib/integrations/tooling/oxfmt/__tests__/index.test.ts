import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function runAssess(files: FileSystemTestContext) {
  return readPackageJson(ROOT).pipe(
    Effect.flatMap((packageJson) => oxfmt.assess(ROOT, packageJson)),
    provideFiles(files)
  )
}

describe("oxfmt", () => {
  describe("create", () => {
    it.effect("create a config that assess accepts", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify({
            devDependencies: { oxfmt: oxfmt.version },
            name: "test-project",
            scripts: { check: "adamantite check" },
            version: "1.0.0",
          }),
        })

        yield* oxfmt.create(ROOT).pipe(provideFiles(files))

        expect(yield* runAssess(files)).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )
  })

  describe("assess", () => {
    it.effect("report only the legacy format script when no other managed script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: { format: "adamantite format" },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              goal: ["Remove the `format` script from `package.json`."],
              id: "legacy-format-script",
              notes: expect.arrayContaining([expect.stringContaining("`AGENTS.md`")]),
            },
          ],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report the legacy format script next to the managed check script", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxfmt.config.ts": toOxfmtTsConfigContent(),
          "package.json": JSON.stringify(
            {
              devDependencies: {
                oxfmt: oxfmt.version,
              },
              name: "test-project",
              scripts: {
                check: "adamantite check",
                format: "adamantite format",
              },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "legacy-format-script" }],
          packageActions: [],
        })
      })
    )

    it.effect("ignore a format script that Adamantite does not manage", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: { format: "prettier --write ." },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: false,
          warnings: [],
        })
      })
    )

    it.effect("report healthy when managed check script and config exist", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxfmt.config.ts": toOxfmtTsConfigContent(),
          "package.json": JSON.stringify(
            {
              devDependencies: {
                oxfmt: oxfmt.version,
              },
              name: "test-project",
              scripts: {
                check: "adamantite check",
              },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("report missing package when managed fix script exists", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: {
                fix: "adamantite fix",
              },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const result = yield* runAssess(files)

        expect(result).toMatchObject({
          applicable: true,
          findings: [{ id: "missing-oxfmt" }, { id: "missing-oxfmt-config" }],
          packageActions: [{ package: "oxfmt", type: "install_package" }],
          warnings: [],
        })
      })
    )
  })
})
