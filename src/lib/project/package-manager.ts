import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { FailedToReadFile, NoPackageManager } from "#lib/shared/errors.ts"
import { checkExists, readFileIfExists } from "#lib/shared/filesystem.ts"

export const SUPPORTED_PACKAGE_MANAGERS = ["bun", "deno", "npm", "pnpm", "yarn"] as const

export type SupportedPackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]

export interface DetectedPackageManager {
  readonly name: SupportedPackageManager
  readonly version?: string
}

// Yarn 2 and later write a YAML lockfile with a `__metadata` entry near its top, and Yarn 1 writes
// its own format under a `# yarn lockfile v1` header.
const YARN_MODERN_LOCKFILE = /^__metadata:/mu

const YARN_CLASSIC_LOCKFILE = /^# yarn lockfile v1$/mu

/**
 * Npm adds a dependency at the workspace root without a flag, and Yarn 2 and later have no such
 * flag.
 */
const PACKAGE_MANAGERS = {
  bun: {
    add: "add",
    lockfileVersion: () => undefined,
    lockfiles: ["bun.lock", "bun.lockb"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => [],
  },
  deno: {
    add: "add",
    lockfileVersion: () => undefined,
    lockfiles: ["deno.lock"],
    run: "task",
    specifier: (pkg: string) => `npm:${pkg}`,
    workspaceRoot: () => [],
  },
  npm: {
    add: "install",
    lockfileVersion: () => undefined,
    lockfiles: ["package-lock.json"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => [],
  },
  pnpm: {
    add: "add",
    lockfileVersion: () => undefined,
    lockfiles: ["pnpm-lock.yaml"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: () => ["--workspace-root"],
  },
  yarn: {
    add: "add",
    lockfileVersion: (head: string) =>
      YARN_MODERN_LOCKFILE.test(head) ? "2" : YARN_CLASSIC_LOCKFILE.test(head) ? "1" : undefined,
    lockfiles: ["yarn.lock"],
    run: "run",
    specifier: (pkg: string) => pkg,
    workspaceRoot: (version: string | undefined) =>
      version === undefined || version.split(".")[0] === "1" ? ["-W"] : [],
  },
} as const satisfies Record<
  SupportedPackageManager,
  {
    readonly add: string
    readonly lockfileVersion: (head: string) => string | undefined
    readonly lockfiles: readonly string[]
    readonly run: string
    readonly specifier: (pkg: string) => string
    readonly workspaceRoot: (version: string | undefined) => readonly string[]
  }
>

export function formatRunScript(packageManager: SupportedPackageManager, script: string): string {
  return `${packageManager} ${PACKAGE_MANAGERS[packageManager].run} ${script}`
}

export function getRunVerb(packageManager: SupportedPackageManager): string {
  return PACKAGE_MANAGERS[packageManager].run
}

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

const LOCKFILE_HEAD_BYTES = 1024

const detectIn = Effect.fn("detectIn")(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem
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

  if (Option.isNone(byLockfile)) {
    return Option.none<DetectedPackageManager>()
  }

  const { lockfile, name } = byLockfile.value

  const head = yield* fs
    .stream(path.join(directory, lockfile), { bytesToRead: LOCKFILE_HEAD_BYTES })
    .pipe(
      Stream.decodeText,
      Stream.mkString,
      Effect.mapError((cause) => new FailedToReadFile({ cause, path: lockfile }))
    )

  const version = PACKAGE_MANAGERS[name].lockfileVersion(head)

  return Option.some<DetectedPackageManager>(version === undefined ? { name } : { name, version })
})

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
