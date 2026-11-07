import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import { readProject } from "#lib/workspace/project.ts"

const reactDoctor = managedPlugin("oxlint-plugin-react-doctor")
const ROOT = "/project"

describe("React Doctor package", () => {
  it.effect.each([undefined, "0.1.0", reactDoctor.version])(
    "maintain the package for react-strict with installed version %s",
    (version) =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "oxlint.config.ts": toOxlintTsConfigContent(["react", "react-strict"]),
            "package.json": JSON.stringify({
              devDependencies: version ? { "oxlint-plugin-react-doctor": version } : {},
              scripts: { check: "adamantite check" },
            }),
          },
          root: ROOT,
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => reactDoctor.assess(project)),
          Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
        )

        expect(result.applicable).toBe(true)
        if (!result.applicable) return
        expect(result.packageActions).toMatchObject(
          version === reactDoctor.version
            ? []
            : [{ package: "oxlint-plugin-react-doctor", type: version ? "update_package" : "install_package" }]
        )
      })
  )
})
