import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import {
  addDevDependency,
  detectPackageManager as detectNypmPackageManager,
  type PackageManagerName,
} from "nypm"
import { FailedToInstallDependency, NoPackageManager } from "#errors.ts"
import { Cwd } from "#services/cwd.ts"

export interface DetectedPackageManager {
  readonly name: PackageManagerName
  readonly warnings?: string[]
}

export class DependencyInstaller extends ServiceMap.Service<
  DependencyInstaller,
  {
    readonly addDevDependencies: (
      packages: string[],
      options?: {
        readonly silent?: boolean
        readonly workspace?: boolean
      }
    ) => Effect.Effect<void, FailedToInstallDependency>
    readonly detectPackageManager: () => Effect.Effect<
      DetectedPackageManager | null,
      NoPackageManager
    >
  }
>()("DependencyInstaller") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const cwd = yield* Cwd

      return {
        addDevDependencies: (packages, options) =>
          Effect.gen(function* () {
            const currentDir = yield* cwd.get

            return yield* Effect.tryPromise({
              catch: (cause) => new FailedToInstallDependency({ cause, packages }),
              try: () => addDevDependency(packages, { ...options, cwd: currentDir }),
            }).pipe(Effect.asVoid)
          }),
        detectPackageManager: () =>
          Effect.gen(function* () {
            const currentDir = yield* cwd.get
            const detectedPackageManager = yield* Effect.tryPromise({
              catch: (cause) => new NoPackageManager({ cause }),
              try: () => detectNypmPackageManager(currentDir),
            })

            return detectedPackageManager ?? null
          }),
      }
    })
  )
}
