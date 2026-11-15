import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { NoPackageManager } from "#lib/shared/errors.ts"
import { checkExists, readFileIfExists } from "#lib/shared/filesystem.ts"

/**
 * The package managers that Adamantite detects, installs with, and writes commands and CI workflows
 * for.
 */
export const SUPPORTED_PACKAGE_MANAGERS = ["bun", "deno", "npm", "pnpm", "yarn"] as const

export type SupportedPackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]

/**
 * The supported package managers as prose, such as "bun, deno, npm, pnpm, or yarn".
 */
export function listSupportedPackageManagers(type: "conjunction" | "disjunction"): string {
  return new Intl.ListFormat("en-US", { type }).format(SUPPORTED_PACKAGE_MANAGERS)
}

/**
 * The package manager of a project, with the version that the `packageManager` field of
 * `package.json` pins, when it pins one.
 */
export interface DetectedPackageManager {
  readonly name: SupportedPackageManager
  readonly version?: string
}

/**
 * How each package manager names its lockfiles, runs a script, and adds a development dependency.
 * `workspaceRoot` holds the flags that add the dependency at the root of a monorepo: npm installs
 * at the root without one, and Yarn 2 and later have no such flag.
 */
const PACKAGE_MANAGERS = {
  bun: {
    add: "add",
    lockfiles: ["bun.lock", "bun.lockb"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => [],
  },
  deno: {
    add: "add",
    lockfiles: ["deno.lock"],
    run: "task",
    specifier: (pkg: string) => `npm:${pkg}`,
    workspaceRoot: () => [],
  },
  npm: {
    add: "install",
    lockfiles: ["package-lock.json"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => [],
  },
  pnpm: {
    add: "add",
    lockfiles: ["pnpm-lock.yaml"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => ["--workspace-root"],
  },
  yarn: {
    add: "add",
    lockfiles: ["yarn.lock"],
    run: "run",
    specifier: (pkg: string) => pkg,
    // A project without a pinned version uses Yarn 1, as `yarn.lock` alone does not say.
    workspaceRoot: (version: string | undefined) =>
      version === undefined || version.startsWith("1.") ? ["-W"] : [],
  },
} as const satisfies Record<
  SupportedPackageManager,
  {
    readonly add: string
    readonly lockfiles: readonly string[]
    readonly run: string
    readonly specifier: (pkg: string) => string
    readonly workspaceRoot: (version: string | undefined) => readonly string[]
  }
>

/**
 * The command that runs `script` with `packageManager`, such as `pnpm run check` or `deno task
 * check`.
 */
export function formatRunScript(packageManager: SupportedPackageManager, script: string): string {
  return `${packageManager} ${PACKAGE_MANAGERS[packageManager].run} ${script}`
}

/**
 * The run verb of `packageManager`, such as `run` or `task`.
 */
export function getRunVerb(packageManager: SupportedPackageManager): string {
  return PACKAGE_MANAGERS[packageManager].run
}

/**
 * The arguments that add `packages` as development dependencies, at the workspace root when
 * `workspaceRoot` is set.
 */
export function getAddDevDependencyArgs(
  { name, version }: DetectedPackageManager,
  packages: readonly string[],
  workspaceRoot: boolean
): string[] {
  const packageManager = PACKAGE_MANAGERS[name]

  return [
    packageManager.add,
    ...(workspaceRoot ? packageManager.workspaceRoot(version) : []),
    "-D",
    ...packages.map(packageManager.specifier),
  ]
}

// The `packageManager` field, such as `pnpm@10.0.0+sha512.…`. A field that names another package
// manager does not decode, and detection falls back to the lockfiles.
const PackageManagerField = Schema.fromJsonString(
  Schema.Struct({
    packageManager: Schema.TemplateLiteralParser([
      Schema.Literals(SUPPORTED_PACKAGE_MANAGERS),
      "@",
      Schema.String,
    ]),
  })
)

const decodePackageManagerField = Schema.decodeUnknownOption(PackageManagerField)

const LOCKFILES = SUPPORTED_PACKAGE_MANAGERS.flatMap((name) =>
  PACKAGE_MANAGERS[name].lockfiles.map((lockfile) => ({ lockfile, name }))
)

const detectIn = Effect.fn("detectIn")(function* (directory: string) {
  const path = yield* Path.Path
  const manifest = yield* readFileIfExists(path.join(directory, "package.json"))
  const field = Option.flatMap(manifest, decodePackageManagerField)

  if (Option.isSome(field)) {
    const [name, , version] = field.value.packageManager

    return Option.some<DetectedPackageManager>({ name, version })
  }

  const byLockfile = yield* Effect.findFirst(LOCKFILES, ({ lockfile }) =>
    checkExists(path.join(directory, lockfile))
  )

  return Option.map(byLockfile, ({ name }): DetectedPackageManager => ({ name }))
})

/**
 * The package manager of the project at `cwd`, from the `packageManager` field of `package.json` or
 * else a lockfile, in `cwd` or the nearest folder above it that has either. None when no folder up
 * to the root names a supported package manager.
 */
export const detectPackageManager = Effect.fn("detectPackageManager")(
  function* (cwd: string) {
    const path = yield* Path.Path
    let directory = path.resolve(cwd)

    for (;;) {
      const detected = yield* detectIn(directory)
      const parent = path.dirname(directory)

      if (Option.isSome(detected) || parent === directory) {
        return detected
      }

      directory = parent
    }
  },
  Effect.mapError((cause) => new NoPackageManager({ cause }))
)
