import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import {
  addDevDependency,
  detectPackageManager as detectNypmPackageManager,
  type PackageManagerName,
} from "nypm"
import { FailedToInstallDependency, NoPackageManager } from "#errors.ts"

export interface DetectedPackageManager {
  readonly name: PackageManagerName
  readonly warnings?: string[]
}

export class DependencyInstaller extends ServiceMap.Service<
  DependencyInstaller,
  {
    readonly addDevDependencies: (
      packages: string[],
      cwd: string,
      options?: {
        readonly silent?: boolean
        readonly workspace?: boolean
      }
    ) => Effect.Effect<void, FailedToInstallDependency>
    readonly detectPackageManager: (
      cwd: string
    ) => Effect.Effect<DetectedPackageManager | null, NoPackageManager>
  }
>()("DependencyInstaller") {
  static readonly layer = Layer.succeed(this)({
    addDevDependencies: (packages, cwd, options) =>
      Effect.tryPromise({
        catch: (cause) => new FailedToInstallDependency({ cause, packages }),
        try: () => addDevDependency(packages, { ...options, cwd }),
      }).pipe(Effect.asVoid),
    detectPackageManager: (cwd) =>
      Effect.tryPromise({
        catch: (cause) => new NoPackageManager({ cause }),
        try: () => detectNypmPackageManager(cwd),
      }).pipe(Effect.map((detectedPackageManager) => detectedPackageManager ?? null)),
  })
}
