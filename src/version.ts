import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { MissingPackageVersion } from "#errors.ts"
import { Cwd } from "#services/cwd.ts"
import { readPackageJson } from "#utils.ts"

export const getPackageVersion = () =>
  Effect.runPromise(
    readPackageJson().pipe(
      Effect.flatMap((packageJson) =>
        packageJson.version
          ? Effect.succeed(packageJson.version)
          : Effect.die(new MissingPackageVersion({ path: "package.json" }))
      ),
      Effect.provide(Layer.mergeAll(NodeServices.layer, Cwd.layer))
    )
  )
