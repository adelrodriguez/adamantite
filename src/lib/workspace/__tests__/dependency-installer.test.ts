import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { addRootDevDependencies, DependencyInstaller } from "#lib/workspace/dependency-installer.ts"

const ROOT = "/project"

describe("addRootDevDependencies", () => {
  it.effect("clear the module resolver cache after the install", () =>
    Effect.gen(function* () {
      const events: string[] = []
      const files = createFileSystemTestContext({ files: { "package.json": "{}" }, root: ROOT })

      // A resolution before the install cached the packages as missing. The install changes
      // node_modules, so a later resolution must not reuse that cache.
      yield* addRootDevDependencies(ROOT, ["oxlint@1.0.0"]).pipe(
        Effect.provide([
          files.layer,
          Path.layer,
          makeModuleResolverLayer(
            ROOT,
            {},
            Effect.sync(() => {
              events.push("clear cache")
            })
          ),
          Layer.succeed(DependencyInstaller)({
            addDevDependencies: () =>
              Effect.sync(() => {
                events.push("install")
              }),
            detectPackageManager: () => Effect.succeed({ name: "pnpm" }),
          }),
        ])
      )

      expect(events).toStrictEqual(["install", "clear cache"])
    })
  )
})
