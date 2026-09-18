import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  addDevDependency,
  detectPackageManager as detectNypmPackageManager,
  type PackageManagerName,
} from "nypm"
import { FailedToInstallDependency, NoPackageManager } from "#lib/shared/errors.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"

export interface DetectedPackageManager {
  readonly name: PackageManagerName
  readonly warnings?: string[]
}

export class DependencyInstaller extends Context.Service<
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
    addDevDependencies: Effect.fn("DependencyInstaller.addDevDependencies")(
      (
        packages: string[],
        cwd: string,
        options?: { readonly silent?: boolean; readonly workspace?: boolean }
      ) =>
        Effect.tryPromise({
          catch: (cause) => new FailedToInstallDependency({ cause, packages }),
          try: () => addDevDependency(packages, { ...options, cwd }),
        }).pipe(Effect.asVoid)
    ),
    detectPackageManager: Effect.fn("DependencyInstaller.detectPackageManager")((cwd: string) =>
      Effect.tryPromise({
        catch: (cause) => new NoPackageManager({ cause }),
        try: () => detectNypmPackageManager(cwd),
      }).pipe(Effect.map((detectedPackageManager) => detectedPackageManager ?? null))
    ),
  })
}

/**
 * Nypm maps `workspace: true` to the flag that lets pnpm and Yarn 1 install at the workspace root.
 * For npm it maps to `--workspaces`, which installs into every workspace package, and a plain npm
 * install from the root already installs at the root.
 */
function needsWorkspaceRootFlag(
  packageManager: PackageManagerName | undefined,
  isMonorepo: boolean
): boolean {
  return isMonorepo && packageManager !== "npm"
}

export const addRootDevDependencies = (cwd: string, packages: string[]) =>
  Effect.gen(function* () {
    const dependencyInstaller = yield* DependencyInstaller
    const isMonorepo = yield* checkIsMonorepo(cwd)
    const packageManager = yield* dependencyInstaller.detectPackageManager(cwd)

    yield* dependencyInstaller.addDevDependencies(packages, cwd, {
      silent: true,
      workspace: needsWorkspaceRootFlag(packageManager?.name, isMonorepo),
    })
  })
