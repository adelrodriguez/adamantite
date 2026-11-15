import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { checkIsMonorepo } from "#lib/project/monorepo.ts"
import {
  type DetectedPackageManager,
  detectPackageManager,
  getAddDevDependencyArgs,
} from "#lib/project/package-manager.ts"
import { CommandFailed, FailedToInstallDependency, NoPackageManager } from "#lib/shared/errors.ts"

export class DependencyInstaller extends Context.Service<
  DependencyInstaller,
  {
    /**
     * Add `packages` as development dependencies of the project at `cwd` with its package manager,
     * at the workspace root when `workspace` is set. The package manager's output shows only in the
     * error of a failed install.
     */
    readonly addDevDependencies: (
      packages: readonly string[],
      cwd: string,
      options: { readonly workspace: boolean }
    ) => Effect.Effect<void, FailedToInstallDependency>
    readonly detectPackageManager: (
      cwd: string
    ) => Effect.Effect<Option.Option<DetectedPackageManager>, NoPackageManager>
  }
>()("DependencyInstaller") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const context = yield* Effect.context<
        ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
      >()

      return {
        addDevDependencies: (packages, cwd, options) =>
          Effect.gen(function* () {
            const packageManager = yield* detectPackageManager(cwd).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.fail(new NoPackageManager({})),
                  onSome: Effect.succeed,
                })
              )
            )

            const args = getAddDevDependencyArgs(packageManager, packages, options.workspace)
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

            const handle = yield* spawner.spawn(
              ChildProcess.make(packageManager.name, args, { cwd, stdin: "ignore" })
            )

            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ],
              { concurrency: "unbounded" }
            )

            if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
              return yield* new CommandFailed({
                command: [packageManager.name, ...args].join(" "),
                exitCode,
                output: `${stdout}${stderr}`,
              })
            }
          }).pipe(
            Effect.scoped,
            Effect.mapError(
              (cause) => new FailedToInstallDependency({ cause, packages: [...packages] })
            ),
            Effect.provideContext(context),
            Effect.withSpan("DependencyInstaller.addDevDependencies")
          ),
        detectPackageManager: (cwd) =>
          detectPackageManager(cwd).pipe(Effect.provideContext(context)),
      }
    })
  )
}

/**
 * Install `packages` at the workspace root. An install changes `node_modules`, so the module
 * resolver forgets what earlier resolutions read, also when the install fails part way.
 */
export const addRootDevDependencies = (cwd: string, packages: readonly string[]) =>
  Effect.gen(function* () {
    const dependencyInstaller = yield* DependencyInstaller
    const resolver = yield* ModuleResolver
    const isMonorepo = yield* checkIsMonorepo(cwd)

    yield* dependencyInstaller
      .addDevDependencies(packages, cwd, { workspace: isMonorepo })
      .pipe(Effect.ensuring(resolver.clearCache))
  })
