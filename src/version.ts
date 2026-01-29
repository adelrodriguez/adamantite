import { NodeContext } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { MissingPackageVersion } from "#errors.ts"
import { CwdLive } from "#services/cwd.ts"

import { readPackageJson } from "#utils.ts"

export const getPackageVersion = () =>
  Effect.runPromise(
    readPackageJson().pipe(
      Effect.flatMap((packageJson) =>
        packageJson.version
          ? Effect.succeed(packageJson.version)
          : Effect.die(new MissingPackageVersion({ path: "package.json" }))
      ),
      Effect.provide(Layer.mergeAll(NodeContext.layer, CwdLive))
    )
  )
