import { describe, expect, test } from "bun:test"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import { Cwd } from "#services/cwd.ts"
import { checkIsMonorepo, readPackageJson } from "#utils.ts"

describe("services", () => {
  test("readPackageJson respects the injected cwd service", async () => {
    const cwdLayer = Layer.succeed(Cwd)({
      get: Effect.succeed("/test/project"),
    })
    const fileSystemLayer = FileSystem.layerNoop({
      readFileString: () =>
        Effect.succeed(
          JSON.stringify({
            name: "test-project",
            version: "1.0.0",
          })
        ),
    })

    const result = await readPackageJson().pipe(
      Effect.provide(cwdLayer),
      Effect.provide(fileSystemLayer),
      Effect.provide(NodeServices.layer),
      Effect.runPromise
    )

    expect(result.name).toBe("test-project")
    expect(result.version).toBe("1.0.0")
  })

  test("checkIsMonorepo respects the injected cwd service", async () => {
    const cwdLayer = Layer.succeed(Cwd)({
      get: Effect.succeed("/test/project"),
    })
    const fileSystemLayer = FileSystem.layerNoop({
      exists: () => Effect.succeed(false),
      readFileString: () =>
        Effect.succeed(
          JSON.stringify({
            name: "test-project",
            version: "1.0.0",
            workspaces: ["packages/*"],
          })
        ),
    })

    const result = await checkIsMonorepo().pipe(
      Effect.provide(cwdLayer),
      Effect.provide(fileSystemLayer),
      Effect.provide(NodeServices.layer),
      Effect.runPromise
    )

    expect(result).toBe(true)
  })
})
